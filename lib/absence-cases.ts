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
  messages: Array<{ actor: string; message: string; createdAt: string }>;
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

function cleanReason(value: string, minimum = 20): string {
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (clean.length < minimum || clean.length > 2000) {
    throw new AbsenceCaseError(`The reason must contain ${minimum} to 2000 characters.`);
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

function statusForTriage(triage: AbsenceTriage): {
  status: AbsenceStatus;
  waitingOn: "learner" | "admin";
} {
  if (triage.nextAction === "ask_clarification") {
    return { status: "needs_clarification", waitingOn: "learner" };
  }
  if (triage.nextAction === "request_evidence") {
    return { status: "evidence_required", waitingOn: "learner" };
  }
  return { status: "pending_admin", waitingOn: "admin" };
}

async function createAdminAction(
  client: PoolClient,
  caseId: string,
  studentId: string,
  sensitivityFlags: string[],
): Promise<void> {
  const priority = sensitivityFlags.some((flag) => flag === "legal" || flag === "personal_safety")
    ? "high"
    : "normal";
  await client.query(
    `INSERT INTO admin_action_items
       (action_type, entity_type, entity_id, student_id, title, safe_summary, priority, status)
     VALUES ('absence_review', 'absence_case', $1::uuid, $2,
             'Absence case requires review',
             'A learner is waiting for a human absence decision. Open UnivAI to review the protected case details.',
             $3, 'pending')
     ON CONFLICT (action_type, entity_type, entity_id) DO UPDATE
       SET status = 'pending', priority = EXCLUDED.priority,
           resolved_at = NULL, resolved_by = NULL, updated_at = CURRENT_TIMESTAMP`,
    [caseId, studentId, priority],
  );

  const admins = await client.query<{ id: string }>(
    `SELECT "id"::text AS id FROM "user" WHERE role IN ('admin', 'super_admin')`,
  );
  for (const admin of admins.rows) {
    await enqueueEmailNotificationWithClient(client, {
      userId: admin.id,
      eventId: `absence-case:${caseId}:admin-review`,
      event: {
        type: "admin.action_required",
        title: "Absence case requires review",
        safeSummary: "A learner is waiting for a human absence decision. Evidence remains available only inside the admin dashboard.",
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
): Promise<LearnerAbsenceCase> {
  const reason = cleanReason(reasonValue);
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 4) {
    throw new AbsenceCaseError("Choose between one and four missed lectures or quizzes.");
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
  const next = statusForTriage(triage);
  const client = await pool.connect();
  let caseId = "";
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO absence_cases
         (student_id, status, reason, waiting_on, question_code, recommendation,
          policy_clause_ids, sensitivity_flags, admin_summary, ai_confidence, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10, CURRENT_TIMESTAMP)
       RETURNING id::text`,
      [
        user.registrationNumber, next.status, reason, next.waitingOn, triage.questionCode,
        triage.recommendation, triage.policyClauseIds, triage.sensitivityFlags,
        triage.adminSummary, triage.confidence,
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
      `INSERT INTO absence_case_messages (case_id, actor, message)
       VALUES ($1::uuid, 'learner', $2)`,
      [caseId, reason],
    );
    if (triage.questionCode) {
      await client.query(
        `INSERT INTO absence_case_messages (case_id, actor, question_code, message)
         VALUES ($1::uuid, 'system', $2, $3)`,
        [caseId, triage.questionCode, ABSENCE_QUESTION_TEXT[triage.questionCode]],
      );
      await enqueueEmailNotificationWithClient(client, {
        userId: user.id,
        eventId: `absence-case:${caseId}:question:0`,
        event: {
          type: "absence.clarification_required",
          question: ABSENCE_QUESTION_TEXT[triage.questionCode],
        },
      });
    }
    await recordTriage(client, caseId, facts, triage);
    if (next.status === "pending_admin") {
      await createAdminAction(client, caseId, user.registrationNumber, triage.sensitivityFlags);
    }
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
    query<{ case_id: string; actor: string; message: string; created_at: Date }>(
      `SELECT message.case_id::text, message.actor, message.message, message.created_at
         FROM absence_case_messages AS message
         JOIN absence_cases AS absence_case ON absence_case.id = message.case_id
        WHERE absence_case.student_id = $1 AND message.case_id = ANY($2::uuid[])
        ORDER BY message.created_at ASC, message.id ASC`,
      [studentId, ids],
    ),
    query<{ case_id: string; count: string | number }>(
      `SELECT case_id::text, COUNT(*) AS count FROM absence_evidence
        WHERE student_id = $1 AND case_id = ANY($2::uuid[]) GROUP BY case_id`,
      [studentId, ids],
    ),
  ]);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    reason: row.reason,
    waitingOn: row.waiting_on,
    questionCode: row.question_code,
    question: row.question_code ? ABSENCE_QUESTION_TEXT[row.question_code] : null,
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
    messages: messages.filter((message) => message.case_id === row.id).map((message) => ({
      actor: message.actor,
      message: message.message,
      createdAt: iso(message.created_at)!,
    })),
    evidenceCount: Number(evidence.find((item) => item.case_id === row.id)?.count ?? 0),
  }));
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
  const answer = cleanReason(answerValue, 10);
  const current = await queryOne<{
    reason: string;
    clarification_rounds: number;
    question_code: AbsenceQuestionCode | null;
  }>(
    `SELECT reason, clarification_rounds, question_code FROM absence_cases
      WHERE id = $1::uuid AND student_id = $2 AND status = 'needs_clarification'`,
    [caseId, user.registrationNumber],
  );
  if (!current) throw new AbsenceCaseError("This case is not waiting for clarification.", 409);
  const items = await query<{ item_type: AbsenceItemType; week: number }>(
    `SELECT item_type, week FROM absence_case_items WHERE case_id = $1::uuid ORDER BY week`,
    [caseId],
  );
  const priorMessages = await query<{ message: string }>(
    `SELECT message FROM absence_case_messages
      WHERE case_id = $1::uuid AND actor = 'learner' ORDER BY created_at`,
    [caseId],
  );
  const facts = JSON.stringify({
    claimed_items: items,
    learner_statement: current.reason,
    latest_answer: answer,
    verification_state: "unverified",
  });
  let triage = await triageAbsence(facts, JSON.stringify(priorMessages.map((row) => row.message)));
  const nextRound = current.clarification_rounds + 1;
  if (nextRound >= 2 && triage.nextAction === "ask_clarification") {
    triage = { ...triage, nextAction: "pending_admin", questionCode: null, recommendation: "human_review" };
  }
  const next = statusForTriage(triage);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE absence_cases SET
         status = $1, waiting_on = $2, clarification_rounds = $3,
         question_code = $4, recommendation = $5, policy_clause_ids = $6::text[],
         sensitivity_flags = $7::text[], admin_summary = $8, ai_confidence = $9,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $10::uuid AND student_id = $11
         AND status = 'needs_clarification' AND clarification_rounds = $12`,
      [
        next.status, next.waitingOn, nextRound, triage.questionCode, triage.recommendation,
        triage.policyClauseIds, triage.sensitivityFlags, triage.adminSummary, triage.confidence,
        caseId, user.registrationNumber, current.clarification_rounds,
      ],
    );
    if (updated.rowCount !== 1) throw new AbsenceCaseError("The case changed; refresh and try again.", 409);
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, message) VALUES ($1::uuid, 'learner', $2)`,
      [caseId, answer],
    );
    if (triage.questionCode) {
      const question = ABSENCE_QUESTION_TEXT[triage.questionCode];
      await client.query(
        `INSERT INTO absence_case_messages (case_id, actor, question_code, message)
         VALUES ($1::uuid, 'system', $2, $3)`,
        [caseId, triage.questionCode, question],
      );
      await enqueueEmailNotificationWithClient(client, {
        userId: user.id,
        eventId: `absence-case:${caseId}:question:${nextRound}`,
        event: { type: "absence.clarification_required", question },
      });
    }
    await recordTriage(client, caseId, `${facts}\n${answer}`, triage);
    if (next.status === "pending_admin") {
      await createAdminAction(client, caseId, user.registrationNumber, triage.sensitivityFlags);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return (await getLearnerAbsenceCase(user.registrationNumber, caseId))!;
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
    const locked = await client.query<{ sensitivity_flags: string[] }>(
      `SELECT sensitivity_flags FROM absence_cases
        WHERE id = $1::uuid AND student_id = $2 AND status = 'evidence_required'
        FOR UPDATE`,
      [caseId, studentId],
    );
    if (!locked.rows[0]) throw new AbsenceCaseError("This case is not waiting for evidence.", 409);
    await client.query(
      `INSERT INTO absence_evidence
         (case_id, student_id, mime_type, original_filename, byte_length,
          sha256, image_data, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7,
               CURRENT_TIMESTAMP + INTERVAL '90 days')`,
      [
        caseId, studentId, evidence.mimeType, evidence.originalFilename,
        evidence.bytes.length, evidence.sha256, evidence.bytes,
      ],
    );
    await client.query(
      `UPDATE absence_cases SET status = 'pending_admin', waiting_on = 'admin',
              question_code = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid`,
      [caseId],
    );
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, message)
       VALUES ($1::uuid, 'system', 'Evidence received and secured for human review.')`,
      [caseId],
    );
    await createAdminAction(client, caseId, studentId, locked.rows[0].sensitivity_flags ?? []);
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

export type AdminAction = {
  id: string;
  caseId: string;
  studentId: string;
  studentName: string;
  title: string;
  safeSummary: string;
  priority: string;
  status: string;
  createdAt: string;
};

export async function getAdminActions(): Promise<AdminAction[]> {
  const rows = await query<{
    id: string; entity_id: string; student_id: string; student_name: string;
    title: string; safe_summary: string; priority: string; status: string; created_at: Date;
  }>(
    `SELECT action.id::text, action.entity_id::text, action.student_id,
            learner.name AS student_name, action.title, action.safe_summary,
            action.priority, action.status, action.created_at
       FROM admin_action_items AS action
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
    createdAt: iso(row.created_at)!,
  }));
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
    query<{ actor: string; message: string; created_at: Date }>(
      `SELECT actor, message, created_at FROM absence_case_messages
        WHERE case_id = $1::uuid ORDER BY created_at, id`,
      [caseId],
    ),
    query<{ id: string; mime_type: string; original_filename: string; byte_length: number; created_at: Date }>(
      `SELECT id::text, mime_type, original_filename, byte_length, created_at
         FROM absence_evidence WHERE case_id = $1::uuid AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at`,
      [caseId],
    ),
  ]);
  return {
    id: absenceCase.id,
    student: { registrationNumber: absenceCase.student_id, name: absenceCase.student_name, email: absenceCase.student_email },
    status: absenceCase.status,
    reason: absenceCase.reason,
    recommendation: absenceCase.recommendation,
    policyClauseIds: absenceCase.policy_clause_ids,
    sensitivityFlags: absenceCase.sensitivity_flags,
    adminSummary: absenceCase.admin_summary,
    aiConfidence: absenceCase.ai_confidence === null ? null : Number(absenceCase.ai_confidence),
    outcome: absenceCase.outcome,
    decisionReason: absenceCase.decision_reason,
    submittedAt: iso(absenceCase.submitted_at),
    items: items.map((item) => ({ itemType: item.item_type, week: item.week, remedy: item.remedy })),
    messages: messages.map((message) => ({ actor: message.actor, message: message.message, createdAt: iso(message.created_at) })),
    evidence: evidence.map((item) => ({
      id: item.id, mimeType: item.mime_type, filename: item.original_filename,
      byteLength: item.byte_length, createdAt: iso(item.created_at),
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
  const remedy = outcome === "excused" ? "exclude_from_denominator" : outcome === "access_only" ? "replay" : "none";
  const status = outcome === "unexcused" ? "rejected" : "approved";
  const client = await pool.connect();
  let targetStudentId: string | null = null;
  let committed = false;
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ student_id: string; user_id: string }>(
      `SELECT absence_case.student_id, learner."id"::text AS user_id
         FROM absence_cases AS absence_case
         JOIN "user" AS learner ON learner."registrationNumber" = absence_case.student_id
        WHERE absence_case.id = $1::uuid AND absence_case.status = 'pending_admin'
        FOR UPDATE OF absence_case`,
      [caseId],
    );
    const target = locked.rows[0];
    if (!target) throw new AbsenceCaseError("This case is not waiting for an admin decision.", 409);
    targetStudentId = target.student_id;
    await client.query(
      `UPDATE absence_cases SET status = $1, waiting_on = 'none', outcome = $2,
              decision_reason = $3, decided_at = CURRENT_TIMESTAMP,
              decided_by = $4::uuid, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5::uuid`,
      [status, outcome, decisionReason, adminUserId, caseId],
    );
    await client.query(
      `UPDATE absence_case_items SET remedy = $1 WHERE case_id = $2::uuid`,
      [remedy, caseId],
    );
    await client.query(
      `INSERT INTO absence_case_messages (case_id, actor, message)
       VALUES ($1::uuid, 'admin', $2)`,
      [caseId, decisionReason],
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
