import "server-only";

import { query, queryOne } from "./db";
import {
  AI_OUTPUT_REPORT_REASONS,
  AI_OUTPUT_TARGET_TYPES,
  curriculumFeedbackTarget,
  lectureFeedbackTarget,
  raiseHandFeedbackTarget,
  sectionFeedbackTarget,
  type AiOutputReportReason,
  type AiOutputTarget,
  type AiOutputTargetType,
} from "./ai-output-feedback-types";

type LikeRequest = AiOutputTarget & { action: "like"; liked: boolean };
type ReportRequest = AiOutputTarget & {
  action: "report";
  reason: AiOutputReportReason;
  detail: string | null;
};
export type AiOutputFeedbackRequest = LikeRequest | ReportRequest;

export type ParseFeedbackResult =
  | { ok: true; value: AiOutputFeedbackRequest }
  | { ok: false; error: string };

export type SubmitAiOutputFeedbackResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 404 | 409; error: string };

let schemaPromise: Promise<void> | null = null;

/**
 * Additive fallback for app-only deployments. Migration 025 is the source of
 * truth, but this keeps independently deployed web instances compatible.
 */
export function ensureAiOutputFeedbackSchema(): Promise<void> {
  schemaPromise ??= query(`
    ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS trace_id TEXT;
    UPDATE qa_log SET trace_id = gen_random_uuid()::text
     WHERE trace_id IS NULL OR btrim(trace_id) = '';
    ALTER TABLE qa_log ALTER COLUMN trace_id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE qa_log ALTER COLUMN trace_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS qa_log_trace_id_key ON qa_log(trace_id);

    CREATE TABLE IF NOT EXISTS ai_output_reactions (
      id BIGSERIAL PRIMARY KEY,
      student_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN
        ('raise_hand_answer', 'lecture', 'section', 'curriculum')),
      target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
      target_version TEXT NOT NULL CHECK (length(target_version) BETWEEN 1 AND 200),
      trace_id TEXT NOT NULL CHECK (length(trace_id) BETWEEN 1 AND 300),
      rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
      liked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, target_type, target_id, target_version)
    );
    CREATE INDEX IF NOT EXISTS ai_output_reactions_target_idx
      ON ai_output_reactions(target_type, target_id, target_version);
    CREATE INDEX IF NOT EXISTS ai_output_reactions_student_updated_idx
      ON ai_output_reactions(student_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_output_reports (
      id BIGSERIAL PRIMARY KEY,
      student_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN
        ('raise_hand_answer', 'lecture', 'section', 'curriculum')),
      target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
      target_version TEXT NOT NULL CHECK (length(target_version) BETWEEN 1 AND 200),
      trace_id TEXT NOT NULL CHECK (length(trace_id) BETWEEN 1 AND 300),
      reason TEXT NOT NULL CHECK (reason IN
        ('incorrect', 'unsupported_or_uncited', 'irrelevant',
         'unsafe_or_inappropriate', 'copyright_or_privacy', 'technical_issue')),
      detail TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
        ('pending', 'reviewing', 'resolved', 'dismissed')),
      admin_note TEXT CHECK (admin_note IS NULL OR length(admin_note) <= 2000),
      reviewed_by UUID REFERENCES "user"("id") ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (student_id, target_type, target_id, target_version)
    );
    CREATE INDEX IF NOT EXISTS ai_output_reports_queue_idx
      ON ai_output_reports(status, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS ai_output_reports_target_idx
      ON ai_output_reports(target_type, target_id, target_version);
  `).then(() => undefined).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function isTargetType(value: unknown): value is AiOutputTargetType {
  return typeof value === "string" &&
    (AI_OUTPUT_TARGET_TYPES as readonly string[]).includes(value);
}

function isReportReason(value: unknown): value is AiOutputReportReason {
  return typeof value === "string" &&
    (AI_OUTPUT_REPORT_REASONS as readonly string[]).includes(value);
}

export function parseAiOutputFeedbackRequest(body: unknown): ParseFeedbackResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;
  if (!isTargetType(raw.target_type)) {
    return { ok: false, error: "target_type is not supported." };
  }
  for (const field of ["target_id", "target_version", "trace_id"] as const) {
    const limit = field === "trace_id" ? 300 : 200;
    if (typeof raw[field] !== "string" || !raw[field].trim() || raw[field].length > limit) {
      return { ok: false, error: `${field} must be a non-empty string of at most ${limit} characters.` };
    }
  }
  const target: AiOutputTarget = {
    targetType: raw.target_type,
    targetId: (raw.target_id as string).trim(),
    targetVersion: (raw.target_version as string).trim(),
    traceId: (raw.trace_id as string).trim(),
  };

  if (raw.action === "like") {
    if (typeof raw.liked !== "boolean") {
      return { ok: false, error: "liked must be a boolean." };
    }
    return { ok: true, value: { ...target, action: "like", liked: raw.liked } };
  }
  if (raw.action === "report") {
    if (!isReportReason(raw.reason)) {
      return { ok: false, error: "Choose a valid report reason." };
    }
    if (raw.detail !== undefined && raw.detail !== null && typeof raw.detail !== "string") {
      return { ok: false, error: "detail must be a string or null." };
    }
    const detail = typeof raw.detail === "string" ? raw.detail.trim() : "";
    if (detail.length > 2000) {
      return { ok: false, error: "detail must be at most 2000 characters." };
    }
    return {
      ok: true,
      value: { ...target, action: "report", reason: raw.reason, detail: detail || null },
    };
  }
  return { ok: false, error: "action must be like or report." };
}

async function resolveOwnedTarget(
  registrationNumber: string,
  target: AiOutputTarget,
): Promise<AiOutputTarget | null> {
  if (target.targetType === "raise_hand_answer") {
    if (!/^\d+$/.test(target.targetId)) return null;
    const row = await queryOne<{ id: string; trace_id: string }>(
      `SELECT id::text AS id, trace_id
         FROM qa_log
        WHERE id = $1::bigint AND student_id = $2`,
      [target.targetId, registrationNumber],
    );
    return row ? raiseHandFeedbackTarget(row.id, row.trace_id) : null;
  }
  if (target.targetType === "lecture") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.targetId)) {
      return null;
    }
    const row = await queryOne<{ artifact_id: string; updated_at: Date }>(
      `SELECT artifact_id::text AS artifact_id, updated_at
         FROM lecture_artifacts
        WHERE artifact_id = $1::uuid AND student_id = $2`,
      [target.targetId, registrationNumber],
    );
    return row
      ? lectureFeedbackTarget(row.artifact_id, new Date(row.updated_at).toISOString())
      : null;
  }
  if (target.targetType === "section") {
    const row = await queryOne<{ section_pack_id: string; payload_hash: string }>(
      `SELECT section_pack_id, payload_hash
         FROM section_packs
        WHERE section_pack_id = $1 AND tenant_id = $2`,
      [target.targetId, registrationNumber],
    );
    return row ? sectionFeedbackTarget(row.section_pack_id, row.payload_hash) : null;
  }
  if (!/^\d+$/.test(target.targetId)) return null;
  const row = await queryOne<{ id: number; plan_version: number }>(
    `SELECT id, plan_version
       FROM programmes
      WHERE id = $1::integer AND student_id = $2`,
    [target.targetId, registrationNumber],
  );
  return row ? curriculumFeedbackTarget(row.id, row.plan_version) : null;
}

function sameTarget(left: AiOutputTarget, right: AiOutputTarget): boolean {
  return left.targetType === right.targetType && left.targetId === right.targetId &&
    left.targetVersion === right.targetVersion && left.traceId === right.traceId;
}

export async function submitAiOutputFeedback(
  registrationNumber: string,
  input: AiOutputFeedbackRequest,
): Promise<SubmitAiOutputFeedbackResult> {
  await ensureAiOutputFeedbackSchema();
  const canonical = await resolveOwnedTarget(registrationNumber, input);
  if (!canonical) {
    return { ok: false, status: 404, error: "The generated output was not found for this learner." };
  }
  if (!sameTarget(canonical, input)) {
    return { ok: false, status: 409, error: "This generated output version is no longer current." };
  }

  const values = [
    registrationNumber,
    canonical.targetType,
    canonical.targetId,
    canonical.targetVersion,
    canonical.traceId,
  ];
  if (input.action === "like") {
    const reaction = await queryOne<Record<string, unknown>>(
      `INSERT INTO ai_output_reactions
         (student_id, target_type, target_id, target_version, trace_id, liked)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, target_type, target_id, target_version)
       DO UPDATE SET trace_id = EXCLUDED.trace_id, liked = EXCLUDED.liked,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING id, target_type, target_id, target_version, trace_id,
                 liked, updated_at`,
      [...values, input.liked],
    );
    return { ok: true, value: { reaction } };
  }

  const report = await queryOne<Record<string, unknown>>(
    `INSERT INTO ai_output_reports
       (student_id, target_type, target_id, target_version, trace_id, reason, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (student_id, target_type, target_id, target_version)
     DO UPDATE SET trace_id = EXCLUDED.trace_id, reason = EXCLUDED.reason,
                   detail = EXCLUDED.detail, status = 'pending', admin_note = NULL,
                   reviewed_by = NULL, reviewed_at = NULL,
                   updated_at = CURRENT_TIMESTAMP
     RETURNING id, target_type, target_id, target_version, trace_id,
               reason, detail, status, created_at, updated_at`,
    [...values, input.reason, input.detail],
  );
  return { ok: true, value: { report } };
}
