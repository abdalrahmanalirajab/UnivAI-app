import "server-only";

import { query, queryOne } from "./db";
import { ensureAiOutputFeedbackSchema } from "./ai-output-feedback";
import {
  AI_OUTPUT_REPORT_STATUSES,
  AI_OUTPUT_TARGET_TYPES,
  type AiOutputReportReason,
  type AiOutputReportStatus,
  type AiOutputTargetType,
} from "./ai-output-feedback-types";

export type AdminFeedbackReport = {
  id: number;
  studentId: string;
  learnerName: string | null;
  learnerEmail: string | null;
  targetType: AiOutputTargetType;
  targetId: string;
  targetVersion: string;
  traceId: string;
  reason: AiOutputReportReason;
  detail: string | null;
  status: AiOutputReportStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type AdminFeedbackReportFilters = {
  page: number;
  pageSize: number;
  status: AiOutputReportStatus | null;
  targetType: AiOutputTargetType | null;
};

type ReportRow = {
  id: number;
  student_id: string;
  learner_name: string | null;
  learner_email: string | null;
  target_type: AiOutputTargetType;
  target_id: string;
  target_version: string;
  trace_id: string;
  reason: AiOutputReportReason;
  detail: string | null;
  status: AiOutputReportStatus;
  admin_note: string | null;
  created_at: Date;
  updated_at: Date;
  reviewed_at: Date | null;
};

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function positiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Invalid report pagination.");
  return parsed;
}

export function parseAdminFeedbackReportFilters(
  params: URLSearchParams,
): AdminFeedbackReportFilters {
  const page = positiveInteger(params.get("page"), 1);
  const pageSize = positiveInteger(params.get("pageSize"), 25);
  if (pageSize > 100) throw new Error("Invalid report pagination.");
  const rawStatus = params.get("status")?.trim() ?? "";
  const rawTargetType = params.get("targetType")?.trim() ?? "";
  if (rawStatus && !isOneOf(rawStatus, AI_OUTPUT_REPORT_STATUSES)) {
    throw new Error("Invalid report status.");
  }
  if (rawTargetType && !isOneOf(rawTargetType, AI_OUTPUT_TARGET_TYPES)) {
    throw new Error("Invalid report target type.");
  }
  return {
    page,
    pageSize,
    status: rawStatus ? rawStatus as AiOutputReportStatus : null,
    targetType: rawTargetType ? rawTargetType as AiOutputTargetType : null,
  };
}

function toReport(row: ReportRow): AdminFeedbackReport {
  return {
    id: Number(row.id),
    studentId: row.student_id,
    learnerName: row.learner_name,
    learnerEmail: row.learner_email,
    targetType: row.target_type,
    targetId: row.target_id,
    targetVersion: row.target_version,
    traceId: row.trace_id,
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  };
}

export async function listAdminFeedbackReports(
  registrationNumber: string | null,
  filters: AdminFeedbackReportFilters,
) {
  await ensureAiOutputFeedbackSchema();
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (registrationNumber) {
    values.push(registrationNumber);
    conditions.push(`r.student_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`r.status = $${values.length}`);
  }
  if (filters.targetType) {
    values.push(filters.targetType);
    conditions.push(`r.target_type = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM ai_output_reports r ${where}`,
    values,
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const listValues = [...values, filters.pageSize, (page - 1) * filters.pageSize];
  const limit = `$${values.length + 1}`;
  const offset = `$${values.length + 2}`;
  const rows = await query<ReportRow>(
    `SELECT r.id, r.student_id, u."name" AS learner_name,
            u."email" AS learner_email, r.target_type, r.target_id,
            r.target_version, r.trace_id, r.reason, r.detail, r.status,
            r.admin_note, r.created_at, r.updated_at, r.reviewed_at
       FROM ai_output_reports r
       LEFT JOIN "user" u ON u."registrationNumber" = r.student_id
       ${where}
      ORDER BY CASE WHEN r.status = 'pending' THEN 0
                    WHEN r.status = 'reviewing' THEN 1 ELSE 2 END,
               r.created_at DESC, r.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    listValues,
  );
  return {
    reports: rows.map(toReport),
    pagination: { page, pageSize: filters.pageSize, total, pages },
  };
}

export async function reviewAdminFeedbackReport(input: {
  reportId: number;
  status: AiOutputReportStatus;
  adminNote: string | null;
  actorId: string;
  actorEmail: string;
}): Promise<AdminFeedbackReport | null> {
  await ensureAiOutputFeedbackSchema();
  const updated = await queryOne<{ id: number }>(
    `UPDATE ai_output_reports
        SET status = $2, admin_note = $3,
            reviewed_by = CASE WHEN $2 = 'pending' THEN NULL ELSE $4::uuid END,
            reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    [input.reportId, input.status, input.adminNote, input.actorId],
  );
  if (!updated) return null;
  const row = await queryOne<ReportRow>(
    `SELECT r.id, r.student_id, u."name" AS learner_name,
            u."email" AS learner_email, r.target_type, r.target_id,
            r.target_version, r.trace_id, r.reason, r.detail, r.status,
            r.admin_note, r.created_at, r.updated_at, r.reviewed_at
       FROM ai_output_reports r
       LEFT JOIN "user" u ON u."registrationNumber" = r.student_id
      WHERE r.id = $1`,
    [input.reportId],
  );
  if (!row) return null;
  await query(
    `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
     VALUES ('review-ai-output-report', $1, $2, $3, $4::jsonb)`,
    [
      input.actorId,
      input.actorEmail,
      row.student_id,
      JSON.stringify({ reportId: input.reportId, status: input.status }),
    ],
  );
  return toReport(row);
}
