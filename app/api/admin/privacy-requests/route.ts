import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { enqueueEmailNotification } from "@/lib/notification-outbox";
import { requireAdminApi } from "@/lib/session";
import type { PrivacyRequestStatus, PrivacyRequestType } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const STATUSES: PrivacyRequestStatus[] = [
  "received",
  "identity_check",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
];

const REQUEST_LABELS: Record<PrivacyRequestType, string> = {
  access: "personal-data access",
  deletion: "account deletion",
  correction: "data correction",
  portability: "data portability",
  restriction: "data restriction",
  objection: "data objection",
  sale_share_opt_out: "sale or sharing opt-out",
  limit_sensitive_use: "sensitive-data use",
};

type UpdatedPrivacyRequest = {
  id: string;
  user_id: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  admin_note: string | null;
  updated_at: string;
};

function positive(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const requestedPage = positive(request.nextUrl.searchParams.get("page"), 1, 10_000);
  const pageSize = positive(request.nextUrl.searchParams.get("pageSize"), 25, 100);
  const rawStatus = request.nextUrl.searchParams.get("status");
  const status = rawStatus && STATUSES.includes(rawStatus as PrivacyRequestStatus) ? rawStatus : null;
  const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (status) {
    values.push(status);
    conditions.push(`request.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`(
      learner.name ILIKE $${values.length} ESCAPE '\\'
      OR learner.email ILIKE $${values.length} ESCAPE '\\'
      OR learner."registrationNumber" ILIKE $${values.length} ESCAPE '\\'
    )`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::integer AS total
       FROM privacy_requests request
       JOIN "user" learner ON learner.id = request.user_id
       ${where}`,
    values,
  );
  const total = totalRow?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  values.push(pageSize, (page - 1) * pageSize);
  const limitParam = values.length - 1;
  const offsetParam = values.length;
  const requests = await query(
    `SELECT request.id::text, request.request_type, request.status, request.detail,
            request.submitted_at, request.due_at, request.identity_verified_at,
            request.completed_at, request.admin_note, request.updated_at,
            learner.id::text AS user_id, learner.name, learner.email,
            learner."registrationNumber" AS registration_number
       FROM privacy_requests request
       JOIN "user" learner ON learner.id = request.user_id
       ${where}
      ORDER BY
        CASE WHEN request.status IN ('received', 'identity_check', 'in_progress') THEN 0 ELSE 1 END,
        request.due_at ASC, request.submitted_at ASC, request.id ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values,
  );
  return Response.json({
    requests,
    pagination: { page, pageSize, total, pages },
  });
}

export async function PATCH(request: Request) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const { id, status, adminNote, identityVerified } = body as Record<string, unknown>;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Choose a valid privacy request." }, { status: 400 });
  }
  if (typeof status !== "string" || !STATUSES.includes(status as PrivacyRequestStatus)) {
    return Response.json({ error: "Choose a valid request status." }, { status: 400 });
  }
  if (typeof adminNote !== "string" || adminNote.trim().length > 2000) {
    return Response.json({ error: "Admin note must be text of at most 2,000 characters." }, { status: 400 });
  }
  if ((status === "declined" || status === "completed") && adminNote.trim().length < 10) {
    return Response.json(
      { error: "Completed and declined requests need a clear note of at least 10 characters." },
      { status: 400 },
    );
  }
  if (status === "completed" && identityVerified !== true) {
    return Response.json(
      { error: "Verify the learner's identity before completing this request." },
      { status: 400 },
    );
  }
  const updated = await queryOne<UpdatedPrivacyRequest>(
    `WITH changed AS (
       UPDATE privacy_requests SET
         status = $2,
         admin_note = NULLIF($3, ''),
         identity_verified_at = CASE
           WHEN $4::boolean THEN COALESCE(identity_verified_at, CURRENT_TIMESTAMP)
           ELSE identity_verified_at END,
         completed_at = CASE
           WHEN $2 IN ('completed', 'declined', 'cancelled') THEN CURRENT_TIMESTAMP
           ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING id, user_id, request_type, status, detail, submitted_at, due_at,
                 identity_verified_at, completed_at, admin_note, updated_at
     ), audited AS (
       INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       SELECT 'review-privacy-request', $5, $6, user_id::text,
              jsonb_build_object(
                'privacyRequestId', id::text,
                'status', status,
                'identityVerified', identity_verified_at IS NOT NULL
              )
         FROM changed
     )
     SELECT id::text, user_id::text, request_type, status, detail, submitted_at, due_at,
            identity_verified_at, completed_at, admin_note, updated_at
       FROM changed`,
    [id, status, adminNote.trim(), identityVerified === true, gate.id, gate.email],
  );
  if (!updated) {
    return Response.json({ error: "Privacy request not found." }, { status: 404 });
  }

  if (updated.status === "completed" || updated.status === "declined") {
    await enqueueEmailNotification({
      userId: updated.user_id,
      eventId: `privacy-request:${updated.id}:${updated.status}`,
      event: {
        type: "privacy.request_resolved",
        requestLabel: REQUEST_LABELS[updated.request_type],
        status: updated.status,
        outcome: updated.admin_note ?? adminNote.trim(),
      },
    });
  }

  return Response.json({ request: updated });
}
