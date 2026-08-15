import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  webhookSecretBytes: "0123456789abcdef0123456789abcdef",
  webhookSecret: [
    "whsec",
    Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
  ].join("_"),
}));

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_WEBHOOK_SECRET: mocks.webhookSecret,
  },
}));
vi.mock("@/lib/db", () => ({ pool: { connect: mocks.connect } }));

import { POST } from "@/app/api/notifications/resend-webhook/route";

const secret = Buffer.from(mocks.webhookSecretBytes);

function signedRequest(raw: string, signatureOverride?: string) {
  const id = "msg_webhook_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signatureOverride ?? `v1,${createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${raw}`, "utf8")
    .digest("base64")}`;
  return new NextRequest("http://localhost/api/notifications/resend-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    },
    body: raw,
  });
}

describe("Resend delivery webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO email_provider_events")) return { rowCount: 1, rows: [{}] };
      return { rowCount: 1, rows: [] };
    });
  });

  it("verifies the raw body and updates both ledgers without retaining payload content", async () => {
    const raw = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-08-15T01:02:03.000Z",
      data: { email_id: "provider-message-1", to: ["private@example.test"] },
    });

    const response = await POST(signedRequest(raw));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: false });

    const eventInsert = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO email_provider_events"));
    expect(eventInsert?.[1]).toHaveLength(5);
    expect(JSON.stringify(eventInsert?.[1])).not.toContain("private@example.test");

    const ledgerUpdates = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).includes("provider_event_at = $2"));
    expect(ledgerUpdates).toHaveLength(2);
    expect(ledgerUpdates.every(([sql]) => String(sql).includes("provider_event_at <= $2"))).toBe(true);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects an invalid signature before opening a database connection", async () => {
    const response = await POST(signedRequest(
      JSON.stringify({ type: "email.sent" }),
      "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ));
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("deduplicates a repeated provider event without replaying ledger updates", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO email_provider_events")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    const raw = JSON.stringify({
      type: "email.sent",
      created_at: "2026-08-15T01:02:03.000Z",
      data: { email_id: "provider-message-1" },
    });

    const response = await POST(signedRequest(raw));
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.query.mock.calls.some(([sql]) =>
      String(sql).includes("provider_event_at = $2"))).toBe(false);
  });
});
