import "server-only";

import { query, queryOne } from "./db";

export const ADMIN_NOTIFICATION_STATUSES = [
  "queued",
  "retrying",
  "processing",
  "submitted",
  "failed",
  "skipped",
] as const;

export const ADMIN_NOTIFICATION_CATEGORIES = [
  "course",
  "lecture",
  "assessment",
  "transcript",
  "security",
  "billing",
  "admin",
] as const;

export type AdminNotificationStatus = (typeof ADMIN_NOTIFICATION_STATUSES)[number];
export type AdminNotificationCategory = (typeof ADMIN_NOTIFICATION_CATEGORIES)[number];

export type AdminNotificationFilters = {
  status?: AdminNotificationStatus;
  category?: AdminNotificationCategory;
  eventType?: string;
  page: number;
  pageSize: number;
};

type MonitorRow = {
  id: string;
  delivery_source: "outbox" | "direct";
  delivery_status: string;
  category: string;
  event_type: string;
  subject: string;
  attempts: number;
  safe_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  available_at: Date | string | null;
  processing_started_at: Date | string | null;
  sent_at: Date | string | null;
  provider_status: string;
  provider_event_at: Date | string | null;
  delivered_at: Date | string | null;
  learner_sid: string;
  learner_name: string;
  learner_email: string;
};

const DELIVERY_CTE = `WITH delivery AS (
  SELECT outbox.id::text AS id,
         'outbox'::text AS delivery_source,
         CASE
           WHEN outbox.status = 'pending' AND outbox.attempts = 0 THEN 'queued'
           WHEN outbox.status = 'pending' AND outbox.attempts > 0 THEN 'retrying'
           ELSE outbox.status
         END AS delivery_status,
         outbox.category,
         outbox.event_type,
         outbox.subject,
         outbox.attempts,
         outbox.last_error,
         outbox.created_at,
         outbox.updated_at,
         outbox.available_at,
         outbox.locked_at AS processing_started_at,
         outbox.sent_at,
         outbox.provider_status,
         outbox.provider_event_at,
         outbox.delivered_at,
         learner."registrationNumber" AS learner_sid,
         learner.name AS learner_name,
         learner.email AS learner_email
    FROM notification_email_outbox AS outbox
    JOIN "user" AS learner ON learner."id" = outbox.user_id
  UNION ALL
  SELECT direct.id::text AS id,
         'direct'::text AS delivery_source,
         direct.status AS delivery_status,
         direct.category,
         direct.event_type,
         direct.subject,
         direct.attempts,
         direct.last_error,
         direct.created_at,
         direct.updated_at,
         NULL::timestamptz AS available_at,
         NULL::timestamptz AS processing_started_at,
         direct.sent_at,
         direct.provider_status,
         direct.provider_event_at,
         direct.delivered_at,
         learner."registrationNumber" AS learner_sid,
         learner.name AS learner_name,
         learner.email AS learner_email
    FROM notification_email_delivery_log AS direct
    JOIN "user" AS learner ON learner."id" = direct.user_id
)`;

function optionalEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  label: string,
): T | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  if (!allowed.includes(normalized as T)) throw new Error(`Unknown notification ${label}.`);
  return normalized as T;
}

function boundedInteger(value: string | null, fallback: number, maximum: number): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("Invalid notification page.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Invalid notification page.");
  }
  return parsed;
}

export function parseAdminNotificationFilters(params: URLSearchParams): AdminNotificationFilters {
  const eventType = params.get("event")?.trim().toLowerCase() || undefined;
  if (eventType && !/^[a-z][a-z0-9._-]{0,79}$/.test(eventType)) {
    throw new Error("Invalid notification event.");
  }
  const requestedStatus = params.get("status");
  // Keep old bookmarked admin URLs useful after the delivery ledger started
  // distinguishing provider submission from confirmed delivery.
  const status = requestedStatus?.trim().toLowerCase() === "sent"
    ? "submitted"
    : optionalEnum(requestedStatus, ADMIN_NOTIFICATION_STATUSES, "status");
  return {
    status,
    category: optionalEnum(params.get("category"), ADMIN_NOTIFICATION_CATEGORIES, "category"),
    eventType,
    page: boundedInteger(params.get("page"), 1, 100_000),
    pageSize: boundedInteger(params.get("pageSize"), 25, 100),
  };
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeInline(value: string | null | undefined, maximum: number): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeError(value: string | null): string | null {
  if (!value) return null;
  return /^Email delivery failed \([A-Za-z0-9_-]{1,80}\)\.$/.test(value)
    ? value
    : "Email delivery failed.";
}

export async function getAdminNotificationMonitor(
  registrationNumber: string | null,
  filters: AdminNotificationFilters,
) {
  if (registrationNumber) {
    const learner = await queryOne<{ id: string }>(
      `SELECT "id"::text AS id FROM "user" WHERE "registrationNumber" = $1`,
      [registrationNumber],
    );
    if (!learner) return null;
  }

  const conditions = ["true"];
  const values: unknown[] = [];
  if (registrationNumber) {
    values.push(registrationNumber);
    conditions.push(`delivery.learner_sid = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`delivery.delivery_status = $${values.length}`);
  }
  if (filters.category) {
    values.push(filters.category);
    conditions.push(`delivery.category = $${values.length}`);
  }
  if (filters.eventType) {
    values.push(filters.eventType);
    conditions.push(`delivery.event_type = $${values.length}`);
  }
  const where = conditions.join(" AND ");
  const listValues = [...values, filters.pageSize, (filters.page - 1) * filters.pageSize];
  const summaryConditions = ["true"];
  const summaryValues: unknown[] = [];
  if (registrationNumber) {
    summaryValues.push(registrationNumber);
    summaryConditions.push(`delivery.learner_sid = $${summaryValues.length}`);
  }
  if (filters.category) {
    summaryValues.push(filters.category);
    summaryConditions.push(`delivery.category = $${summaryValues.length}`);
  }
  if (filters.eventType) {
    summaryValues.push(filters.eventType);
    summaryConditions.push(`delivery.event_type = $${summaryValues.length}`);
  }
  const summaryWhere = summaryConditions.join(" AND ");

  const [rows, countRow, summaryRows] = await Promise.all([
    query<MonitorRow>(
      `${DELIVERY_CTE}
       SELECT delivery.id,
              delivery.delivery_source,
              delivery.delivery_status,
              delivery.category,
              delivery.event_type,
              delivery.subject,
              delivery.attempts,
              CASE
                WHEN delivery.last_error IS NULL THEN NULL
                WHEN delivery.last_error ~ '^Email delivery failed \\([A-Za-z0-9_-]{1,80}\\)\\.$'
                  THEN delivery.last_error
                ELSE 'Email delivery failed.'
              END AS safe_error,
              delivery.created_at,
              delivery.updated_at,
              delivery.available_at,
              delivery.processing_started_at,
              delivery.sent_at,
              delivery.provider_status,
              delivery.provider_event_at,
              delivery.delivered_at,
              delivery.learner_sid,
              delivery.learner_name,
              delivery.learner_email
         FROM delivery
        WHERE ${where}
        ORDER BY delivery.created_at DESC, delivery.id DESC
        LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    ),
    queryOne<{ total: string | number }>(
      `${DELIVERY_CTE}
       SELECT COUNT(*) AS total FROM delivery WHERE ${where}`,
      values,
    ),
    query<{ delivery_status: string; count: string | number }>(
      `${DELIVERY_CTE}
       SELECT delivery.delivery_status, COUNT(*) AS count
         FROM delivery
        WHERE ${summaryWhere}
        GROUP BY delivery.delivery_status`,
      summaryValues,
    ),
  ]);

  const summary = Object.fromEntries(
    ADMIN_NOTIFICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<AdminNotificationStatus, number>;
  for (const row of summaryRows) {
    if ((ADMIN_NOTIFICATION_STATUSES as readonly string[]).includes(row.delivery_status)) {
      summary[row.delivery_status as AdminNotificationStatus] = Number(row.count) || 0;
    }
  }

  const total = Number(countRow?.total) || 0;
  return {
    registrationNumber,
    summary,
    notifications: rows.map((row) => ({
      id: row.id,
      source: row.delivery_source,
      status: row.delivery_status as AdminNotificationStatus,
      category: row.category as AdminNotificationCategory,
      eventType: safeInline(row.event_type, 80),
      subject: safeInline(row.subject, 180),
      attempts: Math.max(0, Math.min(8, Number(row.attempts) || 0)),
      error: safeError(row.safe_error),
      learner: {
        registrationNumber: safeInline(row.learner_sid, 32),
        name: safeInline(row.learner_name, 120),
        email: safeInline(row.learner_email, 320),
      },
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      nextAttemptAt:
        row.delivery_status === "queued" || row.delivery_status === "retrying"
          ? iso(row.available_at)
          : null,
      processingStartedAt:
        row.delivery_status === "processing" ? iso(row.processing_started_at) : null,
      sentAt: iso(row.sent_at),
      providerStatus: safeInline(row.provider_status, 40) || "unknown",
      providerEventAt: iso(row.provider_event_at),
      deliveredAt: iso(row.delivered_at),
    })),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  };
}
