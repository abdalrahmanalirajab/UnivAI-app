import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_STATUS = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
} as const;

function secretBytes(secret: string): Buffer | null {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Buffer.from(normalized, "base64");
    return bytes.length >= 16 ? bytes : null;
  } catch {
    return null;
  }
}

function validSignature(raw: string, id: string, timestamp: string, header: string): boolean {
  const secret = secretBytes(env.RESEND_WEBHOOK_SECRET);
  if (!secret || !/^\d{10,13}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 5 * 60) return false;
  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${raw}`, "utf8")
    .digest();
  for (const candidate of header.trim().split(/\s+/)) {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      const actual = Buffer.from(encoded, "base64");
      if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true;
    } catch {
      // Try the next rotated signature, if present.
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook verification is not configured." }, { status: 503 });
  }
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!/^[A-Za-z0-9_.-]{1,180}$/.test(id) || !signature) {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }
  const raw = await request.text();
  if (raw.length < 2 || raw.length > 200_000 || !validSignature(raw, id, timestamp, signature)) {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let payload: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }
  const type = payload.type;
  if (typeof type !== "string" || !(type in EVENT_STATUS)) {
    // Valid but irrelevant events (opens/clicks) contain engagement data that
    // this delivery ledger deliberately does not retain.
    return Response.json({ ok: true, ignored: true });
  }
  const emailId = payload.data?.email_id;
  const occurredAt = typeof payload.created_at === "string" ? new Date(payload.created_at) : null;
  if (
    typeof emailId !== "string" || emailId.length < 1 || emailId.length > 180 ||
    !occurredAt || Number.isNaN(occurredAt.getTime())
  ) {
    return Response.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const providerStatus = EVENT_STATUS[type as keyof typeof EVENT_STATUS];
  const digest = createHash("sha256").update(raw).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO email_provider_events
         (provider_event_id, provider_message_id, event_type, payload_digest, occurred_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING id`,
      [id, emailId, providerStatus, digest, occurredAt],
    );
    if (inserted.rowCount === 1) {
      for (const table of ["notification_email_outbox", "notification_email_delivery_log"] as const) {
        await client.query(
          `UPDATE ${table}
              SET provider_status = $1,
                  provider_event_at = $2,
                  delivered_at = CASE WHEN $1 = 'delivered' THEN $2 ELSE delivered_at END,
                  updated_at = CURRENT_TIMESTAMP
            WHERE provider_message_id = $3
              AND (provider_event_at IS NULL OR provider_event_at <= $2)`,
          [providerStatus, occurredAt, emailId],
        );
      }
    }
    await client.query("COMMIT");
    return Response.json({ ok: true, duplicate: inserted.rowCount !== 1 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Could not record email provider event", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
