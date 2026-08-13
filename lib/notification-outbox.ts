import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { now } from "./clock";
import { pool, query, queryOne } from "./db";
import { sendEmail } from "./email";
import { renderNotification } from "./notification-templates";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  OPTIONAL_NOTIFICATION_CATEGORIES,
  type NotificationEvent,
  type OptionalNotificationCategory,
} from "./notification-types";
import { releaseDueTranscripts } from "./transcripts";

const MAX_ATTEMPTS = 8;
const MAX_BATCH_SIZE = 50;

type OutboxRow = {
  id: string;
  email: string;
  subject: string;
  text_body: string;
  attempts: number;
};

export type NotificationPreferences = Record<OptionalNotificationCategory, boolean>;

type NotificationInput = {
  userId: string;
  eventId: string;
  event: NotificationEvent;
};

function isOptionalCategory(value: string): value is OptionalNotificationCategory {
  return (OPTIONAL_NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function parseNotificationPreferencePatch(value: unknown): Partial<NotificationPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("preferences must be an object.");
  }

  const source = value as Record<string, unknown>;
  const updates: Partial<NotificationPreferences> = {};
  for (const [category, enabled] of Object.entries(source)) {
    if (!isOptionalCategory(category)) {
      throw new Error(`Unknown or required notification category: ${category}.`);
    }
    if (typeof enabled !== "boolean") {
      throw new Error(`${category} must be true or false.`);
    }
    updates[category] = enabled;
  }
  if (Object.keys(updates).length === 0) throw new Error("Choose at least one preference.");
  return updates;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const rows = await query<{ category: string; email_enabled: boolean }>(
    `SELECT category, email_enabled
       FROM notification_preferences
      WHERE user_id = $1`,
    [userId],
  );
  const result = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const row of rows) {
    if (isOptionalCategory(row.category)) result[row.category] = row.email_enabled;
  }
  return result;
}

export async function setNotificationPreferences(
  userId: string,
  updates: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const parsed = parseNotificationPreferencePatch(updates);
  await pool.query(
    `INSERT INTO notification_preferences (user_id, category, email_enabled, updated_at)
     SELECT $1::uuid, entry.key, entry.value::boolean, CURRENT_TIMESTAMP
       FROM jsonb_each_text($2::jsonb) AS entry
     ON CONFLICT (user_id, category) DO UPDATE
       SET email_enabled = EXCLUDED.email_enabled,
           updated_at = CURRENT_TIMESTAMP`,
    [userId, JSON.stringify(parsed)],
  );
  return getNotificationPreferences(userId);
}

function durableEventKey(userId: string, eventType: string, eventId: string): string {
  const key = eventId.trim();
  if (!key || key.length > 300) throw new Error("eventId must contain 1 to 300 characters.");
  const digest = createHash("sha256")
    .update(userId)
    .update("\0")
    .update(eventType)
    .update("\0")
    .update(key)
    .digest("hex");
  return `notification:${digest}`;
}

/**
 * Persists one important notification. The eventId must identify the domain
 * event (for example `book:42:plan:3`), not a request or retry.
 */
export async function enqueueEmailNotification(input: {
  userId: string;
  eventId: string;
  event: NotificationEvent;
}): Promise<{ queued: boolean }> {
  const rendered = renderNotification(input.event);
  const eventKey = durableEventKey(input.userId, rendered.eventType, input.eventId);
  const row = await queryOne<{ id: string; status: string }>(
    `INSERT INTO notification_email_outbox
       (event_key, user_id, category, event_type, subject, text_body, status)
     SELECT $1, $2::uuid, $3, $4, $5, $6,
            CASE
              WHEN $3 IN ('security', 'billing')
                OR $4 = 'final.retake_declined'
                OR COALESCE(
                  (SELECT email_enabled
                     FROM notification_preferences
                    WHERE user_id = $2::uuid AND category = $3),
                  true
                )
              THEN 'pending'
              ELSE 'skipped'
            END
      WHERE EXISTS (SELECT 1 FROM "user" WHERE "id" = $2::uuid)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id, status`,
    [
      eventKey,
      input.userId,
      rendered.category,
      rendered.eventType,
      rendered.subject,
      rendered.text,
    ],
  );
  return { queued: Boolean(row && row.status !== "skipped") };
}

/**
 * Transactional variant for domain decisions that must not commit unless their
 * required email is durably queued in the same PostgreSQL transaction.
 */
export async function enqueueEmailNotificationWithClient(
  client: PoolClient,
  input: NotificationInput,
): Promise<{ queued: boolean }> {
  const rendered = renderNotification(input.event);
  const eventKey = durableEventKey(input.userId, rendered.eventType, input.eventId);
  const result = await client.query<{ id: string; status: string }>(
    `INSERT INTO notification_email_outbox
       (event_key, user_id, category, event_type, subject, text_body, status)
     SELECT $1, $2::uuid, $3, $4, $5, $6,
            CASE
              WHEN $3 IN ('security', 'billing')
                OR $4 = 'final.retake_declined'
                OR COALESCE(
                  (SELECT email_enabled
                     FROM notification_preferences
                    WHERE user_id = $2::uuid AND category = $3),
                  true
                )
              THEN 'pending'
              ELSE 'skipped'
            END
      WHERE EXISTS (SELECT 1 FROM "user" WHERE "id" = $2::uuid)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id, status`,
    [
      eventKey,
      input.userId,
      rendered.category,
      rendered.eventType,
      rendered.subject,
      rendered.text,
    ],
  );
  return { queued: Boolean(result.rows[0] && result.rows[0].status !== "skipped") };
}

/** Convenience bridge for flows that still identify learners by registration number. */
export async function enqueueStudentEmailNotification(input: {
  registrationNumber: string;
  eventId: string;
  event: NotificationEvent;
}): Promise<{ queued: boolean }> {
  const user = await queryOne<{ id: string }>(
    `SELECT "id"::text AS id
       FROM "user"
      WHERE "registrationNumber" = $1`,
    [input.registrationNumber],
  );
  if (!user) return { queued: false };
  return enqueueEmailNotification({ userId: user.id, eventId: input.eventId, event: input.event });
}

/** Queues one 24-hour reminder per scheduled lecture; event keys suppress cron overlap. */
export async function enqueueDueLectureReminders(referenceTime?: Date): Promise<number> {
  const currentTime = referenceTime ?? await now();
  const lectures = await query<{
    user_id: string;
    public_id: string;
    title: string;
    starts_at: Date;
  }>(
    `SELECT learner."id"::text AS user_id,
            lecture.public_id::text AS public_id,
            lecture.title,
            lecture.starts_at
       FROM lectures AS lecture
       JOIN "user" AS learner
         ON learner."registrationNumber" = lecture.student_id
      WHERE lecture.starts_at > $1
        AND lecture.starts_at <= $1::timestamptz + INTERVAL '24 hours'
      ORDER BY lecture.starts_at ASC
      LIMIT 100`,
    [currentTime],
  );
  let queued = 0;
  for (const lecture of lectures) {
    const startsAt = new Date(lecture.starts_at);
    const result = await enqueueEmailNotification({
      userId: lecture.user_id,
      eventId: `lecture:${lecture.public_id}:${startsAt.toISOString()}:24h`,
      event: {
        type: "lecture.reminder",
        lectureTitle: lecture.title,
        startsAt,
      },
    });
    if (result.queued) queued += 1;
  }
  return queued;
}

/**
 * Finds completed or failed course builds produced by the Python worker.
 * Ready notifications happen only after every generated week and narration
 * runtime is ready. A failed milestone's attempt counter makes retry failures
 * distinct while cron overlap remains idempotent.
 */
export async function enqueueCourseBuildNotifications(): Promise<number> {
  const courses = await query<{
    user_id: string;
    book_id: number;
    course_title: string;
    status: string;
    failed_week: number | null;
    failed_stage: string | null;
    failed_attempt: number | null;
  }>(
    `SELECT learner."id"::text AS user_id,
            book.id AS book_id,
            COALESCE(NULLIF(book.title, ''), book.filename) AS course_title,
            book.status,
            failed.week AS failed_week,
            failed.stage AS failed_stage,
            failed.attempt_count AS failed_attempt
       FROM books AS book
       JOIN "user" AS learner
         ON learner."registrationNumber" = book.student_id
       LEFT JOIN LATERAL (
         SELECT milestone.week, milestone.stage, milestone.attempt_count
           FROM course_generation_milestones AS milestone
          WHERE milestone.book_id = book.id
            AND milestone.status = 'failed'
          ORDER BY milestone.updated_at DESC, milestone.id DESC
          LIMIT 1
       ) AS failed ON true
      WHERE (
        book.status = 'ready'
        AND book.generation_stage = 'complete'
        AND book.generation_total_weeks > 0
        AND book.generation_ready_weeks >= book.generation_total_weeks
        AND book.generation_audio_ready_weeks >= book.generation_total_weeks
      ) OR book.status IN ('failed', 'partial_failed')
      ORDER BY book.id ASC
      LIMIT 100`,
  );

  let queued = 0;
  for (const course of courses) {
    const failed = course.status === "failed" || course.status === "partial_failed";
    const result = await enqueueEmailNotification({
      userId: course.user_id,
      eventId: failed
        ? `book:${course.book_id}:failed:${course.failed_week ?? 0}:${course.failed_stage ?? "course"}:${course.failed_attempt ?? 0}`
        : `book:${course.book_id}:course-ready`,
      event: failed
        ? { type: "course.failed", courseTitle: course.course_title }
        : { type: "course.ready", courseTitle: course.course_title },
    });
    if (result.queued) queued += 1;
  }
  return queued;
}

/**
 * Releases elapsed transcript review windows and queues each ready notice once.
 * The durable outbox key also makes concurrent dispatchers harmless.
 */
export async function enqueueReleasedTranscriptNotifications(referenceTime?: Date): Promise<number> {
  const currentTime = referenceTime ?? await now();
  await releaseDueTranscripts(currentTime);
  const transcripts = await query<{
    id: string;
    user_id: string;
    course_title: string;
    letter_grade: string;
  }>(
    `SELECT transcript.id,
            learner."id"::text AS user_id,
            transcript.course_title,
            transcript.letter_grade
       FROM course_transcripts AS transcript
       JOIN "user" AS learner
         ON learner."registrationNumber" = transcript.student_id
      WHERE transcript.review_status = 'released'
        AND transcript.notification_queued_at IS NULL
      ORDER BY transcript.release_at ASC, transcript.id ASC
      LIMIT 100`,
  );
  let queued = 0;
  for (const transcript of transcripts) {
    const result = await enqueueEmailNotification({
      userId: transcript.user_id,
      eventId: `transcript:${transcript.id}:released`,
      event: {
        type: "transcript.ready",
        courseTitle: transcript.course_title,
        grade: transcript.letter_grade,
      },
    });
    await pool.query(
      `UPDATE course_transcripts
          SET notification_queued_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND review_status = 'released'
          AND notification_queued_at IS NULL`,
      [transcript.id],
    );
    if (result.queued) queued += 1;
  }
  return queued;
}

async function claimBatch(limit: number, workerId: string): Promise<OutboxRow[]> {
  return query<OutboxRow>(
    `WITH candidates AS (
       SELECT outbox.id
         FROM notification_email_outbox AS outbox
        WHERE outbox.attempts < $1
          AND (
            (outbox.status = 'pending' AND outbox.available_at <= CURRENT_TIMESTAMP)
            OR (
              outbox.status = 'processing'
              AND outbox.locked_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            )
          )
        ORDER BY outbox.available_at ASC, outbox.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
     )
     UPDATE notification_email_outbox AS outbox
        SET status = 'processing',
            attempts = outbox.attempts + 1,
            locked_at = CURRENT_TIMESTAMP,
            locked_by = $3,
            updated_at = CURRENT_TIMESTAMP
       FROM candidates, "user" AS recipient
      WHERE outbox.id = candidates.id
        AND recipient."id" = outbox.user_id
     RETURNING outbox.id, recipient.email, outbox.subject, outbox.text_body, outbox.attempts`,
    [MAX_ATTEMPTS, limit, workerId],
  );
}

async function markSent(id: string, workerId: string): Promise<void> {
  await pool.query(
    `UPDATE notification_email_outbox
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
            locked_at = NULL, locked_by = NULL, last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'processing' AND locked_by = $2`,
    [id, workerId],
  );
}

function safeErrorLabel(error: unknown): string {
  const name = error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_-]/g, "") : "UnknownError";
  return `Email delivery failed (${name || "Error"}).`;
}

async function releaseForRetry(row: OutboxRow, workerId: string, error: unknown): Promise<void> {
  const exhausted = row.attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(60 * 2 ** Math.max(row.attempts - 1, 0), 6 * 60 * 60);
  await pool.query(
    `UPDATE notification_email_outbox
        SET status = $3,
            available_at = CASE
              WHEN $3 = 'pending' THEN CURRENT_TIMESTAMP + ($4 * INTERVAL '1 second')
              ELSE available_at
            END,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $5,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'processing' AND locked_by = $2`,
    [row.id, workerId, exhausted ? "failed" : "pending", delaySeconds, safeErrorLabel(error)],
  );
}

export async function dispatchEmailNotifications(options?: {
  limit?: number;
  workerId?: string;
  deliver?: typeof sendEmail;
}): Promise<{ claimed: number; sent: number; retrying: number; failed: number }> {
  const limit = Math.min(Math.max(Math.trunc(options?.limit ?? 20), 1), MAX_BATCH_SIZE);
  const workerId = options?.workerId ?? randomUUID();
  const deliver = options?.deliver ?? sendEmail;
  const rows = await claimBatch(limit, workerId);
  let sent = 0;
  let retrying = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deliver({
        to: row.email,
        subject: row.subject,
        text: row.text_body,
        idempotencyKey: `univai/${row.id}`,
        requireDelivery: true,
      });
    } catch (error) {
      await releaseForRetry(row, workerId, error);
      if (row.attempts >= MAX_ATTEMPTS) failed += 1;
      else retrying += 1;
      continue;
    }

    // Keep a successful provider send locked if this write fails. A later
    // worker retries with the same provider idempotency key after the stale
    // lock timeout instead of immediately sending a duplicate.
    await markSent(row.id, workerId);
    sent += 1;
  }

  return { claimed: rows.length, sent, retrying, failed };
}
