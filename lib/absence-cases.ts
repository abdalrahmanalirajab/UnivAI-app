import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getAttendance } from "./attendance";
import { pool, query, queryOne } from "./db";
import { getExamStatuses } from "./exams";
import {
  ABSENCE_QUESTION_TEXT,
  triageAbsence,
  type AbsenceQuestionCode,
  type AbsenceTriage,
} from "./absence-triage";
import { enqueueEmailNotificationWithClient } from "./notification-outbox";
import {
  reserveCreditsWithClient,
  settleCreditReservationWithClient,
} from "./credits";

export type AbsenceItemType = "lecture" | "quiz";
export type AbsenceOutcome = "excused" | "access_only" | "unexcused";
export type AbsenceStatus =
  | "needs_clarification"
  | "evidence_required"
  | "pending_admin"
  | "approved"
  | "rejected"
  | "expired"
  | "withdrawn";

export type EligibleAbsenceItem = {
  itemType: AbsenceItemType;
  week: number;
  title: string;
  lecturePublicId: string | null;
};

export type LearnerAbsenceCase = {
  id: string;
  status: AbsenceStatus;
  reason: string;
  waitingOn: "learner" | "admin" | "none";
  questionCode: AbsenceQuestionCode | null;
  question: string | null;
  outcome: AbsenceOutcome | null;
  decisionReason: string | null;
  submittedAt: string;
  decidedAt: string | null;
  items: Array<{ itemType: AbsenceItemType; week: number; remedy: string; lecturePublicId: string | null }>;
  messages: Array<{
    id: string;
    actor: "system" | "learner" | "admin";
    message: string;
    responseRequested: boolean;
    attachmentRequested: boolean;
    createdAt: string;
  }>;
  pendingRequest: {
    messageId: string;
    question: string;
    attachmentRequested: boolean;
    evidenceAttached: boolean;
  } | null;
  evidenceCount: number;
};

export class AbsenceCaseError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "INVALID_ABSENCE_CASE",
  ) {
    super(message);
    this.name = "AbsenceCaseError";
  }
}

const ACTIVE_CASE_STATUSES = [
  "needs_clarification", "evidence_required", "pending_admin", "approved", "rejected",
];

function cleanReason(value: string, minimum = 20, label = "reason"): string {
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (clean.length < minimum || clean.length > 2000) {
    throw new AbsenceCaseError(`The ${label} must contain ${minimum} to 2000 characters.`);
  }
  return clean;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function itemKey(item: Pick<EligibleAbsenceItem, "itemType" | "week">): string {
  return `${item.itemType}:${item.week}`;
}

export async function getEligibleAbsenceItems(studentId: string): Promise<EligibleAbsenceItem[]> {
  const [attendance, exams, claimed] = await Promise.all([
    getAttendance(studentId),
    getExamStatuses(studentId),
    query<{ item_type: AbsenceItemType; week: number }>(
      `SELECT DISTINCT item.item_type, item.week
         FROM absence_case_items AS item
         JOIN absence_cases AS absence_case ON absence_case.id = item.case_id
        WHERE item.student_id = $1 AND absence_case.status = ANY($2::text[])`,
      [studentId, ACTIVE_CASE_STATUSES],
    ),
  ]);
  const unavailable = new Set(claimed.map((item) => `${item.item_type}:${item.week}`));
  const lectureItems: EligibleAbsenceItem[] = attendance
    .filter((record) => record.status === "absent")
    .map((record) => ({
      itemType: "lecture",
      week: record.week,
      title: `Week ${record.week} lecture — ${record.title}`,
      lecturePublicId: record.lectureId,
    }));
  const quizItems: EligibleAbsenceItem[] = exams
    .filter((exam) => exam.kind === "quiz" && exam.state === "missed")
    .map((exam) => ({
      itemType: "quiz",
      week: exam.week!,
      title: exam.title,
      lecturePublicId: null,
    }));
  return [...lectureItems, ...quizItems].filter((item) => !unavailable.has(itemKey(item)));
}

async function createAdminAction(
  client: PoolClient,
  caseId: string,
  studentId: string,
  sensitivityFlags: string[],
  reviewVersion: number,
  learnerReplied = false,
): Promise<void> {
  const priority = sensitivityFlags.some((flag) => flag === "legal" || flag === "personal_safety")
    ? "high"
    : "normal";
  const safeSummary = learnerReplied
    ? "The learner replied to an administrator question. Open UnivAI to continue the protected review."
    : "A learner is waiting for a human absence decision or information request.";
  await client.query(
    `INSERT INTO admin_action_items
       (action_type, entity_type, entity_id, student_id, title, safe_summary, priority, status)
     VALUES ('absence_review', 'absence_case', $1::uuid, $2,
             'Absence case requires review',
             $3, $4, 'pending')
     ON CONFLICT (action_type, entity_type, entity_id) DO UPDATE
       SET status = 'pending', title = EXCLUDED.title,
           safe_summary = EXCLUDED.safe_summary, priority = EXCLUDED.priority,
           resolved_at = NULL, resolved_by = NULL, updated_at = CURRENT_TIMESTAMP`,
    [caseId, studentId, safeSummary, priority],
  );

  const admins = await client.query<{ id: string }>(
    `SELECT "id"::text AS id FROM "user" WHERE role IN ('admin', 'super_admin')`,
  );
  for (const admin of admins.rows) {
    await enqueueEmailNotificationWithClient(client, {
      userId: admin.id,
      eventId: `absence-case:${caseId}:admin-review:${reviewVersion}`,
      event: {
        type: "admin.action_required",
        title: "Absence case requires review",
        safeSummary,
      },
    });
  }
}

async function recordTriage(
  client: PoolClient,
  caseId: string,
  digestInput: string,
  triage: AbsenceTriage,
): Promise<void> {
  const digest = createHash("sha256").update(digestInput).digest("hex");
  await client.query(
    `INSERT INTO absence_ai_runs
       (case_id, prompt_id, prompt_version, model_label, input_digest,
        structured_output, validation_status)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      caseId,
      triage.promptId,
      triage.promptVersion,
      triage.modelLabel,
      digest,
      JSON.stringify({
        recommendation: triage.recommendation,
        next_action: triage.nextAction,
        question_code: triage.questionCode,
        policy_clause_ids: triage.policyClauseIds,
        sensitivity_flags: triage.sensitivityFlags,
        admin_summary: triage.adminSummary,
        confidence: triage.confidence,
      }),
      triage.validationStatus,
    ],
  );
}

function factsFor(reason: string, items: EligibleAbsenceItem[]): string {
  return JSON.stringify({
    claimed_items: items.map((item) => ({ item_type: item.itemType, week: item.week })),
    learner_statement: reason,
    verification_state: "unverified",
  });
}

export async function submitAbsenceCase(
  user: { id: string; registrationNumber: string },
  reasonValue: string,
  requestedItems: Array<{ itemType: AbsenceItemType; week: number }>,
  idempotencyKey: string,
): Promise<LearnerAbsenceCase> {
  const reason = cleanReason(reasonValue);
  if (!Array.isArray(requestedItems) || requestedItems.length !== 1) {
    throw new AbsenceCaseError("Choose exactly one missed lecture or quiz per appeal.");
  }
  const unique = new Set(requestedItems.map(itemKey));
  if (unique.size !== requestedItems.length) throw new AbsenceCaseError("Each missed item may be selected once.");
  if (requestedItems.some((item) =>
    (item.itemType !== "lecture" && item.itemType !== "quiz") ||
    !Number.isInteger(item.week) || item.week < 1
  )) throw new AbsenceCaseError("Choose valid missed items.");

  const eligible = await getEligibleAbsenceItems(user.registrationNumber);
  const eligibleByKey = new Map(eligible.map((item) => [itemKey(item), item]));
  const items = requestedItems.map((item) => eligibleByKey.get(itemKey(item)));
  if (items.some((item) => !item)) {
    throw new AbsenceCaseError(
      "One or more items are not missed, already have a case, or are no longer eligible.",
      409,
      "ITEM_NOT_ELIGIBLE",
    );
  }
  const selected = items as EligibleAbsenceItem[];
  const facts = factsFor(reason, selected);
  const triage = await triageAbsence(facts, "None");
  const client = await pool.connect();
  let caseId = "";
  try {
    await client.query("BEGIN");
    const reservation = await reserveCreditsWithClient(client, {
      userId: user.id,
      purpose: "appeal",
      idempotencyKey: `appeal:${user.id}:${idempotencyKey}`,
      referenceType: selected[0].itemType,
      referenceId: `${selected[0].itemType}:${selected[0].week}`,
      ttlSeconds: 10 * 60,
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO absence_cases
         (student_id, status, reason, waiting_on, question_code, recommendation,
          policy_clause_ids, sensitivity_flags, admin_summary, ai_confidence, submitted_at)
       VALUES ($1, 'pending_admin', $2, 'admin', $3, $4, $5::text[], $6::text[], $7, $8,
               CURRENT_TIMESTAMP)
       RETURNING id::text`,
      [
        user.registrationNumber, reason, triage.questionCode, triage.recommendation,
        triage.policyClauseIds, triage.sensitivityFlags, triage.adminSummary, triage.confidence,
      ],
    );
    caseId = inserted.rows[0].id;
    for (const item of selected) {
      await client.query(
        `INSERT INTO absence_case_items
           (case_id, student_id, item_type, week, lecture_public_id)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid)`,
        [caseId, user.registrationNumber, item.itemType, item.week, item.lecturePublicId],
      );
    }
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, actor_user_id, message)
       VALUES ($1::uuid, 'learner', $2::uuid, $3)`,
      [caseId, user.id, reason],
    );
    await recordTriage(client, caseId, facts, triage);
    await createAdminAction(client, caseId, user.registrationNumber, triage.sensitivityFlags, 0);
    await settleCreditReservationWithClient(client, user.id, reservation.id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new AbsenceCaseError("A case already exists for one of those items.", 409, "CASE_EXISTS");
    }
    throw error;
  } finally {
    client.release();
  }
  const created = await getLearnerAbsenceCase(user.registrationNumber, caseId);
  if (!created) throw new Error("Created absence case could not be loaded.");
  return created;
}

type CaseRow = {
  id: string;
  status: AbsenceStatus;
  reason: string;
  waiting_on: "learner" | "admin" | "none";
  question_code: AbsenceQuestionCode | null;
  outcome: AbsenceOutcome | null;
  decision_reason: string | null;
  submitted_at: Date;
  decided_at: Date | null;
};

async function mapCases(studentId: string, rows: CaseRow[]): Promise<LearnerAbsenceCase[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [items, messages, evidence] = await Promise.all([
    query<{ case_id: string; item_type: AbsenceItemType; week: number; remedy: string; lecture_public_id: string | null }>(
      `SELECT case_id::text, item_type, week, remedy, lecture_public_id::text FROM absence_case_items
        WHERE student_id = $1 AND case_id = ANY($2::uuid[]) ORDER BY week, item_type`,
      [studentId, ids],
    ),
    query<{
      id: string;
      case_id: string;
      actor: "system" | "learner" | "admin";
      message: string;
      response_requested: boolean;
      attachment_requested: boolean;
      created_at: Date;
    }>(
      `SELECT message.id::text, message.case_id::text, message.actor, message.message,
              message.response_requested, message.attachment_requested, message.created_at
         FROM absence_case_messages AS message
         JOIN absence_cases AS absence_case ON absence_case.id = message.case_id
        WHERE absence_case.student_id = $1 AND message.case_id = ANY($2::uuid[])
        ORDER BY message.created_at ASC, message.id ASC`,
      [studentId, ids],
    ),
    query<{ case_id: string; request_message_id: string | null }>(
      `SELECT case_id::text, request_message_id::text
         FROM absence_evidence
        WHERE student_id = $1 AND case_id = ANY($2::uuid[])`,
      [studentId, ids],
    ),
  ]);
  return rows.map((row) => {
    const caseMessages = messages.filter((message) => message.case_id === row.id);
    const caseEvidence = evidence.filter((item) => item.case_id === row.id);
    const pendingMessage = row.status === "needs_clarification" && row.waiting_on === "learner"
      ? [...caseMessages].reverse().find(
          (message) => message.actor === "admin" && message.response_requested,
        ) ?? null
      : null;
    const pendingRequest = pendingMessage
      ? {
          messageId: pendingMessage.id,
          question: pendingMessage.message,
          attachmentRequested: pendingMessage.attachment_requested,
          evidenceAttached: caseEvidence.some(
            (item) => item.request_message_id === pendingMessage.id,
          ),
        }
      : null;
    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      waitingOn: row.waiting_on,
      questionCode: row.waiting_on === "learner" ? row.question_code : null,
      question: pendingRequest?.question ?? null,
      outcome: row.outcome,
      decisionReason: row.decision_reason,
      submittedAt: iso(row.submitted_at)!,
      decidedAt: iso(row.decided_at),
      items: items.filter((item) => item.case_id === row.id).map((item) => ({
        itemType: item.item_type,
        week: item.week,
        remedy: item.remedy,
        lecturePublicId: item.lecture_public_id,
      })),
      messages: caseMessages.map((message) => ({
        id: message.id,
        actor: message.actor,
        message: message.message,
        responseRequested: message.response_requested,
        attachmentRequested: message.attachment_requested,
        createdAt: iso(message.created_at)!,
      })),
      pendingRequest,
      evidenceCount: caseEvidence.length,
    };
  });
}

export async function getLearnerAbsenceCases(studentId: string): Promise<LearnerAbsenceCase[]> {
  const rows = await query<CaseRow>(
    `SELECT id::text, status, reason, waiting_on, question_code, outcome,
            decision_reason, submitted_at, decided_at
       FROM absence_cases WHERE student_id = $1 ORDER BY created_at DESC`,
    [studentId],
  );
  return mapCases(studentId, rows);
}

export async function getLearnerAbsenceCasePage(
  studentId: string,
  page: number,
  pageSize: number,
): Promise<{
  cases: LearnerAbsenceCase[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}> {
  const count = await queryOne<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM absence_cases WHERE student_id = $1",
    [studentId],
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), pages);
  const rows = await query<CaseRow>(
    `SELECT id::text, status, reason, waiting_on, question_code, outcome,
            decision_reason, submitted_at, decided_at
       FROM absence_cases
      WHERE student_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [studentId, pageSize, (normalizedPage - 1) * pageSize],
  );
  return {
    cases: await mapCases(studentId, rows),
    pagination: { page: normalizedPage, pageSize, total, pages },
  };
}

export async function getLearnerAbsenceCase(
  studentId: string,
  caseId: string,
): Promise<LearnerAbsenceCase | null> {
  const row = await queryOne<CaseRow>(
    `SELECT id::text, status, reason, waiting_on, question_code, outcome,
            decision_reason, submitted_at, decided_at
       FROM absence_cases WHERE id = $1::uuid AND student_id = $2`,
    [caseId, studentId],
  );
  return row ? (await mapCases(studentId, [row]))[0] : null;
}

export async function respondToAbsenceClarification(
  user: { id: string; registrationNumber: string },
  caseId: string,
  answerValue: string,
): Promise<LearnerAbsenceCase> {
  const answer = cleanReason(answerValue, 10, "answer");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{
      clarification_rounds: number;
      sensitivity_flags: string[];
    }>(
      `SELECT clarification_rounds, sensitivity_flags
         FROM absence_cases
        WHERE id = $1::uuid AND student_id = $2
          AND status = 'needs_clarification' AND waiting_on = 'learner'
        FOR UPDATE`,
      [caseId, user.registrationNumber],
    );
    const current = locked.rows[0];
    if (!current) {
      throw new AbsenceCaseError("This case is not waiting for your reply.", 409);
    }
    const request = await client.query<{ id: string; attachment_requested: boolean }>(
      `SELECT id::text, attachment_requested
         FROM absence_case_messages
        WHERE case_id = $1::uuid AND actor = 'admin' AND response_requested = true
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [caseId],
    );
    const pendingRequest = request.rows[0];
    if (!pendingRequest) {
      throw new AbsenceCaseError("This case has no active administrator question.", 409);
    }
    if (pendingRequest.attachment_requested) {
      const attached = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM absence_evidence
            WHERE case_id = $1::uuid AND student_id = $2
              AND request_message_id = $3::uuid
         ) AS exists`,
        [caseId, user.registrationNumber, pendingRequest.id],
      );
      if (!attached.rows[0]?.exists) {
        throw new AbsenceCaseError(
          "Attach the image requested by the administrator before sending your reply.",
          409,
          "ATTACHMENT_REQUIRED",
        );
      }
    }
    const updated = await client.query(
      `UPDATE absence_cases SET
         status = 'pending_admin', waiting_on = 'admin', question_code = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid AND student_id = $2
         AND status = 'needs_clarification' AND waiting_on = 'learner'`,
      [caseId, user.registrationNumber],
    );
    if (updated.rowCount !== 1) throw new AbsenceCaseError("The case changed; refresh and try again.", 409);
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, actor_user_id, message)
       VALUES ($1::uuid, 'learner', $2::uuid, $3)`,
      [caseId, user.id, answer],
    );
    await createAdminAction(
      client,
      caseId,
      user.registrationNumber,
      current.sensitivity_flags ?? [],
      current.clarification_rounds,
      true,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return (await getLearnerAbsenceCase(user.registrationNumber, caseId))!;
}

export async function getOpenAbsenceAttachmentRequest(
  studentId: string,
  caseId: string,
): Promise<{ requestMessageId: string } | null> {
  const row = await queryOne<{ request_message_id: string }>(
    `SELECT request.id::text AS request_message_id
       FROM absence_cases AS absence_case
       JOIN LATERAL (
         SELECT message.id, message.attachment_requested
           FROM absence_case_messages AS message
          WHERE message.case_id = absence_case.id
            AND message.actor = 'admin'
            AND message.response_requested = true
          ORDER BY message.created_at DESC, message.id DESC
          LIMIT 1
       ) AS request ON true
       LEFT JOIN absence_evidence AS evidence
         ON evidence.request_message_id = request.id
      WHERE absence_case.id = $1::uuid AND absence_case.student_id = $2
        AND absence_case.status = 'needs_clarification'
        AND absence_case.waiting_on = 'learner'
        AND request.attachment_requested = true
        AND evidence.id IS NULL`,
    [caseId, studentId],
  );
  return row ? { requestMessageId: row.request_message_id } : null;
}

export async function attachAbsenceEvidence(
  studentId: string,
  caseId: string,
  evidence: {
    mimeType: "image/jpeg" | "image/png";
    originalFilename: string;
    bytes: Buffer;
    sha256: string;
  },
): Promise<LearnerAbsenceCase> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ id: string }>(
      `SELECT id::text FROM absence_cases
        WHERE id = $1::uuid AND student_id = $2
          AND status = 'needs_clarification' AND waiting_on = 'learner'
        FOR UPDATE`,
      [caseId, studentId],
    );
    if (!locked.rows[0]) {
      throw new AbsenceCaseError("This case has no open administrator attachment request.", 409);
    }
    const request = await client.query<{ id: string; attachment_requested: boolean }>(
      `SELECT message.id::text, message.attachment_requested
         FROM absence_case_messages AS message
        WHERE message.case_id = $1::uuid AND message.actor = 'admin'
          AND message.response_requested = true
        ORDER BY message.created_at DESC, message.id DESC
        LIMIT 1`,
      [caseId],
    );
    const pendingRequest = request.rows[0];
    if (!pendingRequest?.attachment_requested) {
      throw new AbsenceCaseError(
        "The administrator did not request an attachment for this reply.",
        409,
        "ATTACHMENT_NOT_REQUESTED",
      );
    }
    const requestMessageId = pendingRequest.id;
    const existing = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM absence_evidence
          WHERE case_id = $1::uuid AND student_id = $2
            AND request_message_id = $3::uuid
       ) AS exists`,
      [caseId, studentId, requestMessageId],
    );
    if (existing.rows[0]?.exists) {
      throw new AbsenceCaseError("The requested attachment is already uploaded.", 409);
    }
    await client.query(
      `INSERT INTO absence_evidence
         (case_id, student_id, mime_type, original_filename, byte_length,
          sha256, image_data, request_message_id, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid,
               CURRENT_TIMESTAMP + INTERVAL '90 days')`,
      [
        caseId, studentId, evidence.mimeType, evidence.originalFilename,
        evidence.bytes.length, evidence.sha256, evidence.bytes, requestMessageId,
      ],
    );
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, message)
       VALUES ($1::uuid, 'system', 'The requested image was received and secured for human review.')`,
      [caseId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new AbsenceCaseError("That evidence image is already attached.", 409);
    }
    throw error;
  } finally {
    client.release();
  }
  return (await getLearnerAbsenceCase(studentId, caseId))!;
}

export async function requestAbsenceInformation(
  adminUserId: string,
  caseId: string,
  questionValue: string,
  attachmentRequested: boolean,
): Promise<void> {
  const question = cleanReason(questionValue, 10, "question");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{
      student_id: string;
      user_id: string;
      clarification_rounds: number;
      sensitivity_flags: string[];
    }>(
      `SELECT absence_case.student_id, learner."id"::text AS user_id,
              absence_case.clarification_rounds, absence_case.sensitivity_flags
         FROM absence_cases AS absence_case
         JOIN "user" AS learner
           ON learner."registrationNumber" = absence_case.student_id
        WHERE absence_case.id = $1::uuid
          AND absence_case.status = 'pending_admin'
          AND absence_case.waiting_on = 'admin'
        FOR UPDATE OF absence_case`,
      [caseId],
    );
    const current = locked.rows[0];
    if (!current) {
      throw new AbsenceCaseError("This case is not ready for an administrator question.", 409);
    }
    const nextRound = current.clarification_rounds + 1;
    await client.query(
      `INSERT INTO absence_case_messages
         (case_id, actor, actor_user_id, message, response_requested, attachment_requested)
       VALUES ($1::uuid, 'admin', $2::uuid, $3, true, $4)`,
      [caseId, adminUserId, question, attachmentRequested],
    );
    await client.query(
      `UPDATE absence_cases
          SET status = 'needs_clarification', waiting_on = 'learner',
              clarification_rounds = $2, question_code = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid`,
      [caseId, nextRound],
    );
    const safeSummary = attachmentRequested
      ? "Waiting for the learner's reply and one protected image requested by an administrator."
      : "Waiting for the learner's text reply to an administrator question.";
    await client.query(
      `INSERT INTO admin_action_items
         (action_type, entity_type, entity_id, student_id, title, safe_summary,
          priority, status, assigned_to)
       VALUES ('absence_review', 'absence_case', $1::uuid, $2,
               'Waiting for learner information', $3, $4, 'assigned', $5::uuid)
       ON CONFLICT (action_type, entity_type, entity_id) DO UPDATE
         SET status = 'assigned', assigned_to = EXCLUDED.assigned_to,
             title = EXCLUDED.title, safe_summary = EXCLUDED.safe_summary,
             priority = EXCLUDED.priority, resolved_at = NULL, resolved_by = NULL,
             updated_at = CURRENT_TIMESTAMP`,
      [
        caseId,
        current.student_id,
        safeSummary,
        current.sensitivity_flags.some(
          (flag) => flag === "legal" || flag === "personal_safety",
        ) ? "high" : "normal",
        adminUserId,
      ],
    );
    const attachmentInstruction = attachmentRequested
      ? " The administrator also requires one JPEG or PNG image with your reply."
      : " No attachment was requested; reply with text only.";
    await enqueueEmailNotificationWithClient(client, {
      userId: current.user_id,
      eventId: `absence-case:${caseId}:question:${nextRound}`,
      event: {
        type: "absence.clarification_required",
        question: `${question}${attachmentInstruction}`,
      },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type AdminAction = {
  id: string;
  caseId: string;
  studentId: string;
  studentName: string;
  title: string;
  safeSummary: string;
  priority: string;
  status: string;
  waitingOn: "learner" | "admin" | "none";
  createdAt: string;
};

export async function getAdminActions(): Promise<AdminAction[]> {
  const rows = await query<{
    id: string; entity_id: string; student_id: string; student_name: string;
    title: string; safe_summary: string; priority: string; status: string;
    waiting_on: "learner" | "admin" | "none"; created_at: Date;
  }>(
    `SELECT action.id::text, action.entity_id::text, action.student_id,
            learner.name AS student_name, action.title, action.safe_summary,
            action.priority, action.status, absence_case.waiting_on, action.created_at
       FROM admin_action_items AS action
       JOIN absence_cases AS absence_case
         ON action.action_type = 'absence_review'
        AND action.entity_type = 'absence_case'
        AND absence_case.id = action.entity_id
       LEFT JOIN "user" AS learner ON learner."registrationNumber" = action.student_id
      WHERE action.status IN ('pending', 'assigned')
      ORDER BY CASE action.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
               action.created_at ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    caseId: row.entity_id,
    studentId: row.student_id,
    studentName: row.student_name,
    title: row.title,
    safeSummary: row.safe_summary,
    priority: row.priority,
    status: row.status,
    waitingOn: row.waiting_on,
    createdAt: iso(row.created_at)!,
  }));
}

export async function getAdminActionPage(page: number, pageSize: number): Promise<{
  actions: AdminAction[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}> {
  const condition = `action.status IN ('pending', 'assigned')
    AND action.action_type = 'absence_review'
    AND action.entity_type = 'absence_case'`;
  const count = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM admin_action_items AS action WHERE ${condition}`,
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), pages);
  const rows = await query<{
    id: string; entity_id: string; student_id: string; student_name: string;
    title: string; safe_summary: string; priority: string; status: string;
    waiting_on: "learner" | "admin" | "none"; created_at: Date;
  }>(
    `SELECT action.id::text, action.entity_id::text, action.student_id,
            learner.name AS student_name, action.title, action.safe_summary,
            action.priority, action.status, absence_case.waiting_on, action.created_at
       FROM admin_action_items AS action
       JOIN absence_cases AS absence_case ON absence_case.id = action.entity_id
       LEFT JOIN "user" AS learner ON learner."registrationNumber" = action.student_id
      WHERE ${condition}
      ORDER BY CASE action.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
               action.created_at ASC, action.id ASC
      LIMIT $1 OFFSET $2`,
    [pageSize, (normalizedPage - 1) * pageSize],
  );
  return {
    actions: rows.map((row) => ({
      id: row.id,
      caseId: row.entity_id,
      studentId: row.student_id,
      studentName: row.student_name,
      title: row.title,
      safeSummary: row.safe_summary,
      priority: row.priority,
      status: row.status,
      waitingOn: row.waiting_on,
      createdAt: iso(row.created_at)!,
    })),
    pagination: { page: normalizedPage, pageSize, total, pages },
  };
}

export async function getAdminAbsenceCase(caseId: string) {
  const absenceCase = await queryOne<CaseRow & {
    student_id: string; student_name: string; student_email: string;
    recommendation: string | null; policy_clause_ids: string[];
    sensitivity_flags: string[]; admin_summary: string | null; ai_confidence: string | number | null;
  }>(
    `SELECT absence_case.id::text, absence_case.student_id, learner.name AS student_name,
            learner.email AS student_email, absence_case.status, absence_case.reason,
            absence_case.waiting_on, absence_case.question_code, absence_case.outcome,
            absence_case.decision_reason, absence_case.submitted_at, absence_case.decided_at,
            absence_case.recommendation, absence_case.policy_clause_ids,
            absence_case.sensitivity_flags, absence_case.admin_summary, absence_case.ai_confidence
       FROM absence_cases AS absence_case
       JOIN "user" AS learner ON learner."registrationNumber" = absence_case.student_id
      WHERE absence_case.id = $1::uuid`,
    [caseId],
  );
  if (!absenceCase) return null;
  const [items, messages, evidence] = await Promise.all([
    query<{ item_type: AbsenceItemType; week: number; remedy: string }>(
      `SELECT item_type, week, remedy FROM absence_case_items WHERE case_id = $1::uuid ORDER BY week, item_type`,
      [caseId],
    ),
    query<{
      id: string;
      actor: "system" | "learner" | "admin";
      message: string;
      response_requested: boolean;
      attachment_requested: boolean;
      created_at: Date;
    }>(
      `SELECT id::text, actor, message, response_requested, attachment_requested, created_at
         FROM absence_case_messages
        WHERE case_id = $1::uuid ORDER BY created_at, id`,
      [caseId],
    ),
    query<{
      id: string;
      mime_type: string;
      original_filename: string;
      byte_length: number;
      request_message_id: string | null;
      created_at: Date;
    }>(
      `SELECT id::text, mime_type, original_filename, byte_length,
              request_message_id::text, created_at
         FROM absence_evidence WHERE case_id = $1::uuid AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at`,
      [caseId],
    ),
  ]);
  return {
    id: absenceCase.id,
    student: { registrationNumber: absenceCase.student_id, name: absenceCase.student_name, email: absenceCase.student_email },
    status: absenceCase.status,
    waitingOn: absenceCase.waiting_on,
    reason: absenceCase.reason,
    recommendation: absenceCase.recommendation,
    suggestedQuestion: absenceCase.question_code
      ? ABSENCE_QUESTION_TEXT[absenceCase.question_code]
      : null,
    policyClauseIds: absenceCase.policy_clause_ids,
    sensitivityFlags: absenceCase.sensitivity_flags,
    adminSummary: absenceCase.admin_summary,
    aiConfidence: absenceCase.ai_confidence === null ? null : Number(absenceCase.ai_confidence),
    outcome: absenceCase.outcome,
    decisionReason: absenceCase.decision_reason,
    submittedAt: iso(absenceCase.submitted_at),
    items: items.map((item) => ({ itemType: item.item_type, week: item.week, remedy: item.remedy })),
    messages: messages.map((message) => ({
      id: message.id,
      actor: message.actor,
      message: message.message,
      responseRequested: message.response_requested,
      attachmentRequested: message.attachment_requested,
      createdAt: iso(message.created_at),
    })),
    evidence: evidence.map((item) => ({
      id: item.id, mimeType: item.mime_type, filename: item.original_filename,
      byteLength: item.byte_length, requestMessageId: item.request_message_id,
      createdAt: iso(item.created_at),
    })),
  };
}

export async function decideAbsenceCase(
  adminUserId: string,
  caseId: string,
  outcome: AbsenceOutcome,
  reasonValue: string,
): Promise<void> {
  if (!(["excused", "access_only", "unexcused"] as const).includes(outcome)) {
    throw new AbsenceCaseError("Choose a valid decision.");
  }
  const decisionReason = cleanReason(reasonValue, 10);
  const remedy = outcome === "excused"
    ? "exclude_from_denominator"
    : outcome === "access_only"
      ? "makeup_live"
      : "none";
  const status = outcome === "unexcused" ? "rejected" : "approved";
  const client = await pool.connect();
  let targetStudentId: string | null = null;
  let committed = false;
  try {
    await client.query("BEGIN");
    const locked = await client.query<{
      student_id: string;
      user_id: string;
      item_type: AbsenceItemType;
    }>(
      `SELECT absence_case.student_id, learner."id"::text AS user_id,
              item.item_type
         FROM absence_cases AS absence_case
        JOIN "user" AS learner ON learner."registrationNumber" = absence_case.student_id
        JOIN absence_case_items AS item ON item.case_id = absence_case.id
        WHERE absence_case.id = $1::uuid AND absence_case.status = 'pending_admin'
          AND absence_case.waiting_on = 'admin'
        FOR UPDATE OF absence_case`,
      [caseId],
    );
    const target = locked.rows[0];
    if (!target) throw new AbsenceCaseError("This case is not waiting for an admin decision.", 409);
    if (target.item_type === "quiz" && outcome === "access_only") {
      throw new AbsenceCaseError(
        "Quiz appeals can only be approved for grade exclusion or denied.",
        400,
        "QUIZ_MAKEUP_NOT_ALLOWED",
      );
    }
    targetStudentId = target.student_id;
    await client.query(
      `UPDATE absence_cases SET status = $1, waiting_on = 'none', outcome = $2,
              decision_reason = $3, decided_at = CURRENT_TIMESTAMP,
              decided_by = $4::uuid, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5::uuid`,
      [status, outcome, decisionReason, adminUserId, caseId],
    );
    await client.query(
      `UPDATE absence_case_items
          SET remedy = CASE
            WHEN $1 = 'makeup_live' AND item_type <> 'lecture' THEN 'none'
            ELSE $1
          END,
          makeup_started_at = NULL
        WHERE case_id = $2::uuid`,
      [remedy, caseId],
    );
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, actor_user_id, message)
       VALUES ($1::uuid, 'admin', $2::uuid, $3)`,
      [caseId, adminUserId, decisionReason],
    );
    await client.query(
      `UPDATE admin_action_items SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP,
              resolved_by = $1::uuid, updated_at = CURRENT_TIMESTAMP
        WHERE action_type = 'absence_review' AND entity_id = $2::uuid`,
      [adminUserId, caseId],
    );
    await enqueueEmailNotificationWithClient(client, {
      userId: target.user_id,
      eventId: `absence-case:${caseId}:decision`,
      event: { type: "absence.decision", outcome, decisionReason },
    });
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (committed && targetStudentId) {
    try {
      const final = await queryOne<{ taken_at: Date }>(
        `SELECT taken_at FROM grades
          WHERE student_id = $1 AND kind = 'final' AND flagged = false
          ORDER BY taken_at DESC, id DESC LIMIT 1`,
        [targetStudentId],
      );
      if (final) {
        const { upsertCourseTranscript } = await import("./transcripts");
        await upsertCourseTranscript(targetStudentId, new Date(final.taken_at));
      }
    } catch (error) {
      console.error("Absence decision was saved, but the transcript refresh failed", error);
    }
  }
}
