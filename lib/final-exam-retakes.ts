import type { PoolClient } from "pg";

import { pool, query, queryOne } from "./db";
import {
  isWithinWindow,
  retakeWindowForRequest,
  type FinalExamWindow,
} from "./final-exam-policy";
import { enqueueEmailNotificationWithClient } from "./notification-outbox";
import { upsertCourseTranscript } from "./transcripts";

export type FinalExamForm = "primary" | "retake";
export type FinalizationReason =
  | "request_window_expired"
  | "retake_declined"
  | "retake_completed"
  | "retake_not_taken";

export type StoredFinalResult = {
  examId: string;
  title: string;
  mark: number;
  maxScore: number;
  passed: boolean;
  submittedAt: string;
  report: Record<string, unknown>;
};

type FinalExamCaseRow = {
  student_id: string;
  curriculum_id: string;
  primary_opens_at: Date;
  primary_closes_at: Date;
  request_deadline: Date;
  primary_exam_id: string | null;
  primary_submitted_at: Date | null;
  primary_result: StoredFinalResult | null;
  retake_requested_at: Date | null;
  retake_reason: string | null;
  retake_available_at: Date | null;
  retake_closes_at: Date | null;
  retake_exam_id: string | null;
  retake_submitted_at: Date | null;
  retake_result: StoredFinalResult | null;
  declined_at: Date | null;
  declined_by: string | null;
  decline_reason: string | null;
  finalized_at: Date | null;
  finalization_reason: FinalizationReason | null;
  official_exam_id: string | null;
  official_result: StoredFinalResult | null;
};

export type FinalExamCaseView = {
  curriculumId: string;
  primaryOpensAt: string;
  primaryClosesAt: string;
  requestDeadline: string;
  primaryExamId: string | null;
  primarySubmitted: boolean;
  provisionalResult: Pick<StoredFinalResult, "mark" | "maxScore" | "passed"> | null;
  retakeRequestedAt: string | null;
  retakeReason: string | null;
  retakeAvailableAt: string | null;
  retakeClosesAt: string | null;
  retakeExamId: string | null;
  declineReason: string | null;
  finalizedAt: string | null;
  finalizationReason: FinalizationReason | null;
  officialResult: Pick<StoredFinalResult, "mark" | "maxScore" | "passed"> | null;
  officialAbsent: boolean;
  phase:
    | "scheduled"
    | "primary-open"
    | "request-open"
    | "retake-waiting"
    | "retake-open"
    | "awaiting-grade"
    | "declined"
    | "finalized";
  canStartPrimary: boolean;
  canRequestRetake: boolean;
  canStartRetake: boolean;
};

export type FinalizationOutcome = {
  finalized: boolean;
  studentId: string;
  curriculumId: string;
  reason: FinalizationReason | null;
  result: StoredFinalResult | null;
  absent: boolean;
};

let schemaPromise: Promise<void> | null = null;

/** Runtime guard for existing installs; the numbered migration is canonical. */
export function ensureFinalExamRetakeSchema(): Promise<void> {
  schemaPromise ??= query(`
    CREATE TABLE IF NOT EXISTS final_exam_cases (
      student_id TEXT NOT NULL,
      curriculum_id TEXT NOT NULL,
      primary_opens_at TIMESTAMPTZ NOT NULL,
      primary_closes_at TIMESTAMPTZ NOT NULL,
      request_deadline TIMESTAMPTZ NOT NULL,
      primary_exam_id TEXT,
      primary_submitted_at TIMESTAMPTZ,
      primary_result JSONB,
      retake_requested_at TIMESTAMPTZ,
      retake_reason TEXT,
      retake_available_at TIMESTAMPTZ,
      retake_closes_at TIMESTAMPTZ,
      retake_exam_id TEXT,
      retake_submitted_at TIMESTAMPTZ,
      retake_result JSONB,
      declined_at TIMESTAMPTZ,
      declined_by UUID REFERENCES "user" ("id") ON DELETE SET NULL,
      decline_reason TEXT,
      finalized_at TIMESTAMPTZ,
      finalization_reason TEXT CHECK (
        finalization_reason IS NULL OR finalization_reason IN (
          'request_window_expired', 'retake_declined',
          'retake_completed', 'retake_not_taken'
        )
      ),
      official_exam_id TEXT,
      official_result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, curriculum_id),
      CHECK (primary_closes_at > primary_opens_at),
      CHECK (request_deadline > primary_closes_at),
      CHECK (
        (retake_requested_at IS NULL AND retake_available_at IS NULL AND retake_closes_at IS NULL)
        OR
        (retake_requested_at IS NOT NULL AND retake_available_at > retake_requested_at
          AND retake_closes_at > retake_available_at)
      )
    );
    CREATE INDEX IF NOT EXISTS final_exam_cases_request_queue_idx
      ON final_exam_cases (retake_requested_at, retake_available_at)
      WHERE finalized_at IS NULL AND declined_at IS NULL;
    CREATE INDEX IF NOT EXISTS final_exam_cases_reconcile_idx
      ON final_exam_cases (request_deadline, retake_closes_at)
      WHERE finalized_at IS NULL;
  `)
    .then(() => undefined)
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });
  return schemaPromise;
}

const CASE_COLUMNS = `
  student_id, curriculum_id, primary_opens_at, primary_closes_at,
  request_deadline, primary_exam_id, primary_submitted_at, primary_result,
  retake_requested_at, retake_reason, retake_available_at, retake_closes_at,
  retake_exam_id, retake_submitted_at, retake_result, declined_at,
  declined_by::text AS declined_by, decline_reason, finalized_at,
  finalization_reason, official_exam_id, official_result`;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function compactResult(result: StoredFinalResult | null) {
  return result
    ? { mark: result.mark, maxScore: result.maxScore, passed: result.passed }
    : null;
}

export function finalExamCaseViewAt(row: FinalExamCaseRow, referenceTime: Date): FinalExamCaseView {
  const primaryOpen = isWithinWindow(
    referenceTime,
    asDate(row.primary_opens_at),
    asDate(row.primary_closes_at),
  );
  const requestOpen = isWithinWindow(
    referenceTime,
    asDate(row.primary_closes_at),
    asDate(row.request_deadline),
  );
  const retakeOpen = Boolean(
    row.retake_available_at &&
      row.retake_closes_at &&
      isWithinWindow(referenceTime, asDate(row.retake_available_at), asDate(row.retake_closes_at)),
  );
  const retakeWaiting = Boolean(
    row.retake_requested_at &&
      !row.declined_at &&
      row.retake_available_at &&
      referenceTime.getTime() < asDate(row.retake_available_at).getTime(),
  );
  const awaitingGrade = Boolean(
    !row.finalized_at &&
      ((row.retake_submitted_at && !row.retake_result) ||
        (row.retake_requested_at &&
          row.retake_closes_at &&
          referenceTime >= asDate(row.retake_closes_at) &&
          !row.retake_submitted_at &&
          row.primary_submitted_at &&
          !row.primary_result) ||
        (row.primary_submitted_at && !row.primary_result &&
          (referenceTime >= asDate(row.request_deadline) || Boolean(row.declined_at))))
  );

  const phase: FinalExamCaseView["phase"] = row.finalized_at
    ? "finalized"
    : awaitingGrade
      ? "awaiting-grade"
      : row.declined_at
        ? "declined"
        : retakeOpen
          ? "retake-open"
          : retakeWaiting || row.retake_requested_at
            ? "retake-waiting"
            : primaryOpen
              ? "primary-open"
              : requestOpen
                ? "request-open"
                : "scheduled";

  return {
    curriculumId: row.curriculum_id,
    primaryOpensAt: asDate(row.primary_opens_at).toISOString(),
    primaryClosesAt: asDate(row.primary_closes_at).toISOString(),
    requestDeadline: asDate(row.request_deadline).toISOString(),
    primaryExamId: row.primary_exam_id,
    primarySubmitted: Boolean(row.primary_submitted_at),
    provisionalResult: compactResult(row.primary_result),
    retakeRequestedAt: row.retake_requested_at?.toISOString() ?? null,
    retakeReason: row.retake_reason,
    retakeAvailableAt: row.retake_available_at?.toISOString() ?? null,
    retakeClosesAt: row.retake_closes_at?.toISOString() ?? null,
    retakeExamId: row.retake_exam_id,
    declineReason: row.decline_reason,
    finalizedAt: row.finalized_at?.toISOString() ?? null,
    finalizationReason: row.finalization_reason,
    officialResult: compactResult(row.official_result),
    officialAbsent: row.official_result?.report.absent === true,
    phase,
    canStartPrimary:
      primaryOpen &&
      !row.primary_submitted_at &&
      !row.primary_result &&
      !row.retake_requested_at &&
      !row.finalized_at,
    canRequestRetake:
      requestOpen && !row.retake_requested_at && !row.declined_at && !row.finalized_at,
    canStartRetake:
      retakeOpen &&
      !row.declined_at &&
      !row.retake_submitted_at &&
      !row.retake_result &&
      !row.finalized_at,
  };
}

async function getCaseRow(
  studentId: string,
  curriculumId: string,
): Promise<FinalExamCaseRow | null> {
  await ensureFinalExamRetakeSchema();
  return queryOne<FinalExamCaseRow>(
    `SELECT ${CASE_COLUMNS}
       FROM final_exam_cases
      WHERE student_id = $1 AND curriculum_id = $2`,
    [studentId, curriculumId],
  );
}

export async function ensureFinalExamCase(input: {
  studentId: string;
  curriculumId: string;
  window: FinalExamWindow;
}): Promise<void> {
  if (!input.window.opensAt || !input.window.closesAt || !input.window.retakeRequestDeadline) {
    return;
  }
  await ensureFinalExamRetakeSchema();
  await query(
    `INSERT INTO final_exam_cases
       (student_id, curriculum_id, primary_opens_at, primary_closes_at, request_deadline)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_id, curriculum_id) DO UPDATE SET
       primary_opens_at = CASE
         WHEN final_exam_cases.primary_exam_id IS NULL
          AND final_exam_cases.retake_requested_at IS NULL
          AND final_exam_cases.finalized_at IS NULL
         THEN EXCLUDED.primary_opens_at ELSE final_exam_cases.primary_opens_at END,
       primary_closes_at = CASE
         WHEN final_exam_cases.primary_exam_id IS NULL
          AND final_exam_cases.retake_requested_at IS NULL
          AND final_exam_cases.finalized_at IS NULL
         THEN EXCLUDED.primary_closes_at ELSE final_exam_cases.primary_closes_at END,
       request_deadline = CASE
         WHEN final_exam_cases.primary_exam_id IS NULL
          AND final_exam_cases.retake_requested_at IS NULL
          AND final_exam_cases.finalized_at IS NULL
         THEN EXCLUDED.request_deadline ELSE final_exam_cases.request_deadline END,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.studentId,
      input.curriculumId,
      input.window.opensAt,
      input.window.closesAt,
      input.window.retakeRequestDeadline,
    ],
  );
}

function absentResult(row: FinalExamCaseRow, finalizedAt: Date): StoredFinalResult {
  return {
    examId: `absent:${row.curriculum_id}:${row.student_id}`,
    title: "Final exam",
    mark: 0,
    maxScore: 100,
    passed: false,
    submittedAt: finalizedAt.toISOString(),
    report: { absent: true },
  };
}

async function finalizeLockedCase(
  client: PoolClient,
  row: FinalExamCaseRow,
  result: StoredFinalResult,
  reason: FinalizationReason,
  finalizedAt: Date,
): Promise<FinalizationOutcome> {
  const absent = result.report.absent === true;
  const report = {
    ...result.report,
    absent,
    final_form: reason === "retake_completed" ? "retake" : "primary",
    finalization_reason: reason,
  };
  const feedback = absent
    ? "Absent — final exam 0 (F)."
    : result.passed
      ? "Passed. Final grade confirmed after the retake decision window."
      : "Below the pass mark. Final grade confirmed after the retake decision window.";

  await client.query(
    `INSERT INTO grades
       (student_id, kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report)
     VALUES ($1, 'final', NULL, $2, $3, $4, $5, $6, false, $7::jsonb)
     ON CONFLICT (exam_id) DO UPDATE SET
       student_id = EXCLUDED.student_id,
       kind = 'final', week = NULL, score = EXCLUDED.score,
       max_score = EXCLUDED.max_score, feedback = EXCLUDED.feedback,
       taken_at = EXCLUDED.taken_at, flagged = false, report = EXCLUDED.report`,
    [
      row.student_id,
      result.mark,
      result.maxScore,
      feedback,
      finalizedAt,
      result.examId,
      JSON.stringify(report),
    ],
  );
  await client.query(
    `UPDATE final_exam_cases
        SET finalized_at = $3,
            finalization_reason = $4,
            official_exam_id = $5,
            official_result = $6::jsonb,
            updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1 AND curriculum_id = $2 AND finalized_at IS NULL`,
    [row.student_id, row.curriculum_id, finalizedAt, reason, result.examId, JSON.stringify(result)],
  );
  return {
    finalized: true,
    studentId: row.student_id,
    curriculumId: row.curriculum_id,
    reason,
    result,
    absent,
  };
}

export function finalizationCandidateAt(
  row: FinalExamCaseRow,
  referenceTime: Date,
): { result: StoredFinalResult; reason: FinalizationReason } | null {
  if (row.finalized_at) return null;
  if (row.retake_result) {
    return { result: row.retake_result, reason: "retake_completed" };
  }
  if (row.declined_at) {
    if (row.primary_result) return { result: row.primary_result, reason: "retake_declined" };
    if (!row.primary_submitted_at) {
      return { result: absentResult(row, referenceTime), reason: "retake_declined" };
    }
    return null;
  }
  if (row.retake_requested_at) {
    if (!row.retake_closes_at || referenceTime < asDate(row.retake_closes_at)) return null;
    // Submission consumes the reserve opportunity, but subjective/manual
    // grading may finish after its access window. Never misclassify a submitted
    // paper as a no-show merely because its trusted grade has not arrived yet.
    if (row.retake_submitted_at) return null;
    if (row.primary_result) return { result: row.primary_result, reason: "retake_not_taken" };
    if (!row.primary_submitted_at) {
      return { result: absentResult(row, referenceTime), reason: "retake_not_taken" };
    }
    return null;
  }
  if (referenceTime < asDate(row.request_deadline)) return null;
  if (row.primary_result) return { result: row.primary_result, reason: "request_window_expired" };
  if (!row.primary_submitted_at) {
    return { result: absentResult(row, referenceTime), reason: "request_window_expired" };
  }
  return null;
}

async function reconcileLockedCase(
  client: PoolClient,
  row: FinalExamCaseRow,
  referenceTime: Date,
): Promise<FinalizationOutcome> {
  const candidate = finalizationCandidateAt(row, referenceTime);
  if (!candidate) {
    return {
      finalized: false,
      studentId: row.student_id,
      curriculumId: row.curriculum_id,
      reason: row.finalization_reason,
      result: row.official_result,
      absent: row.official_result?.report.absent === true,
    };
  }
  return finalizeLockedCase(client, row, candidate.result, candidate.reason, referenceTime);
}

export async function reconcileFinalExamCase(
  studentId: string,
  curriculumId: string,
  referenceTime: Date,
): Promise<FinalizationOutcome | null> {
  await ensureFinalExamRetakeSchema();
  const client = await pool.connect();
  let outcome: FinalizationOutcome | null = null;
  try {
    await client.query("BEGIN");
    const found = await client.query<FinalExamCaseRow>(
      `SELECT ${CASE_COLUMNS}
         FROM final_exam_cases
        WHERE student_id = $1 AND curriculum_id = $2
        FOR UPDATE`,
      [studentId, curriculumId],
    );
    const row = found.rows[0];
    if (row) outcome = await reconcileLockedCase(client, row, referenceTime);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (outcome?.finalized && outcome.result) {
    await upsertCourseTranscript(studentId, referenceTime, outcome.result.title);
  }
  return outcome;
}

export async function getFinalExamCase(
  studentId: string,
  curriculumId: string,
  referenceTime: Date,
): Promise<FinalExamCaseView | null> {
  const row = await getCaseRow(studentId, curriculumId);
  return row ? finalExamCaseViewAt(row, referenceTime) : null;
}

export async function requestFinalExamRetake(input: {
  studentId: string;
  curriculumId: string;
  reason: string;
  requestedAt: Date;
}): Promise<FinalExamCaseView> {
  const reason = input.reason.trim();
  if (reason.length < 20 || reason.length > 1000) {
    throw new Error("Explain what happened in 20 to 1000 characters.");
  }
  await ensureFinalExamRetakeSchema();
  const retake = retakeWindowForRequest(input.requestedAt);
  const client = await pool.connect();
  let row: FinalExamCaseRow | null = null;
  try {
    await client.query("BEGIN");
    const found = await client.query<FinalExamCaseRow>(
      `SELECT ${CASE_COLUMNS}
         FROM final_exam_cases
        WHERE student_id = $1 AND curriculum_id = $2
        FOR UPDATE`,
      [input.studentId, input.curriculumId],
    );
    row = found.rows[0] ?? null;
    if (!row) throw new Error("The final exam is not scheduled.");
    if (row.finalized_at) throw new Error("The final grade is already set.");
    if (row.retake_requested_at) throw new Error("A retake request already exists.");
    if (!isWithinWindow(input.requestedAt, asDate(row.primary_closes_at), asDate(row.request_deadline))) {
      throw new Error("Retake requests are accepted only during the 14-day request window.");
    }
    const updated = await client.query<FinalExamCaseRow>(
      `UPDATE final_exam_cases
          SET retake_requested_at = $3, retake_reason = $4,
              retake_available_at = $5, retake_closes_at = $6,
              updated_at = CURRENT_TIMESTAMP
        WHERE student_id = $1 AND curriculum_id = $2
        RETURNING ${CASE_COLUMNS}`,
      [
        input.studentId,
        input.curriculumId,
        input.requestedAt,
        reason,
        retake.availableAt,
        retake.closesAt,
      ],
    );
    row = updated.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return finalExamCaseViewAt(row!, input.requestedAt);
}

export async function recordFinalExamStart(input: {
  studentId: string;
  curriculumId: string;
  form: FinalExamForm;
  examId: string;
  startedAt: Date;
}): Promise<void> {
  await ensureFinalExamRetakeSchema();
  const examColumn = input.form === "primary" ? "primary_exam_id" : "retake_exam_id";
  const row = await getCaseRow(input.studentId, input.curriculumId);
  if (!row) throw new Error("The final exam is not scheduled.");
  const view = finalExamCaseViewAt(row, input.startedAt);
  if (input.form === "primary" ? !view.canStartPrimary : !view.canStartRetake) {
    const existingId = input.form === "primary" ? row.primary_exam_id : row.retake_exam_id;
    if (existingId === input.examId) return;
    throw new Error("This final-exam form is outside its allowed window.");
  }
  await query(
    `UPDATE final_exam_cases
        SET ${examColumn} = COALESCE(${examColumn}, $3), updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1 AND curriculum_id = $2
        AND (${examColumn} IS NULL OR ${examColumn} = $3)`,
    [input.studentId, input.curriculumId, input.examId],
  );
}

export async function recordFinalExamCallback(input: {
  studentId: string;
  form: FinalExamForm;
  examId: string;
  submittedAt: Date;
  result: StoredFinalResult | null;
}): Promise<FinalizationOutcome | null> {
  await ensureFinalExamRetakeSchema();
  const row = await queryOne<Pick<FinalExamCaseRow, "curriculum_id">>(
    `SELECT curriculum_id
       FROM final_exam_cases
      WHERE student_id = $1
        AND (
          ($2 = 'primary' AND (primary_exam_id = $3 OR primary_exam_id IS NULL))
          OR
          ($2 = 'retake' AND retake_requested_at IS NOT NULL
            AND (retake_exam_id = $3 OR retake_exam_id IS NULL))
        )
      ORDER BY CASE
        WHEN ($2 = 'primary' AND primary_exam_id = $3)
          OR ($2 = 'retake' AND retake_exam_id = $3)
        THEN 0 ELSE 1 END,
        primary_opens_at DESC
      LIMIT 1`,
    [input.studentId, input.form, input.examId],
  );
  if (!row) throw new Error("No final-exam policy case exists for this learner.");
  const prefix = input.form === "primary" ? "primary" : "retake";
  await query(
    `UPDATE final_exam_cases
        SET ${prefix}_exam_id = COALESCE(${prefix}_exam_id, $3),
            ${prefix}_submitted_at = COALESCE(${prefix}_submitted_at, $4),
            ${prefix}_result = CASE WHEN $5::jsonb IS NULL THEN ${prefix}_result ELSE $5::jsonb END,
            updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1 AND curriculum_id = $2
        AND (${prefix}_exam_id IS NULL OR ${prefix}_exam_id = $3)`,
    [
      input.studentId,
      row.curriculum_id,
      input.examId,
      input.submittedAt,
      input.result ? JSON.stringify(input.result) : null,
    ],
  );
  return reconcileFinalExamCase(input.studentId, row.curriculum_id, input.submittedAt);
}

export async function declineFinalExamRetake(input: {
  studentId: string;
  curriculumId: string;
  actorId: string;
  actorEmail: string;
  reason: string;
  declinedAt: Date;
}): Promise<{ view: FinalExamCaseView; outcome: FinalizationOutcome | null }> {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new Error("Give the learner a clear reason in 10 to 500 characters.");
  }
  await ensureFinalExamRetakeSchema();
  const client = await pool.connect();
  let decision: { view: FinalExamCaseView; outcome: FinalizationOutcome } | null = null;
  try {
    await client.query("BEGIN");
    const found = await client.query<FinalExamCaseRow>(
      `SELECT ${CASE_COLUMNS}
         FROM final_exam_cases
        WHERE student_id = $1 AND curriculum_id = $2
        FOR UPDATE`,
      [input.studentId, input.curriculumId],
    );
    const row = found.rows[0];
    if (!row?.retake_requested_at) throw new Error("No retake request exists.");
    if (row.finalized_at) throw new Error("The final grade is already set.");
    if (row.retake_exam_id || row.retake_submitted_at) {
      throw new Error("A retake that has started can no longer be declined.");
    }
    if (row.declined_at) throw new Error("This retake request was already declined.");
    const updated = await client.query<FinalExamCaseRow>(
      `UPDATE final_exam_cases
          SET declined_at = $3, declined_by = $4::uuid,
              decline_reason = $5, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = $1 AND curriculum_id = $2
        RETURNING ${CASE_COLUMNS}`,
      [input.studentId, input.curriculumId, input.declinedAt, input.actorId, reason],
    );
    await client.query(
      `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       VALUES ('final.retake_declined', $1, $2, $3, $4::jsonb)`,
      [
        input.actorId,
        input.actorEmail,
        `${input.studentId}:${input.curriculumId}`,
        JSON.stringify({ registrationNumber: input.studentId, curriculumId: input.curriculumId, reason }),
      ],
    );
    const learner = await client.query<{ id: string }>(
      `SELECT "id"::text AS id FROM "user" WHERE "registrationNumber" = $1`,
      [input.studentId],
    );
    if (!learner.rows[0]) throw new Error("The learner account no longer exists.");
    const notification = await enqueueEmailNotificationWithClient(client, {
      userId: learner.rows[0].id,
      eventId: `final-retake:${input.curriculumId}:declined`,
      event: { type: "final.retake_declined", reason },
    });
    if (!notification.queued) {
      throw new Error("Could not queue the required retake-decision email.");
    }
    const outcome = await reconcileLockedCase(client, updated.rows[0], input.declinedAt);
    const current = await client.query<FinalExamCaseRow>(
      `SELECT ${CASE_COLUMNS} FROM final_exam_cases
        WHERE student_id = $1 AND curriculum_id = $2`,
      [input.studentId, input.curriculumId],
    );
    await client.query("COMMIT");
    decision = { view: finalExamCaseViewAt(current.rows[0], input.declinedAt), outcome };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (!decision) throw new Error("The retake decision was not saved.");
  if (decision.outcome.finalized && decision.outcome.result) {
    await upsertCourseTranscript(
      input.studentId,
      input.declinedAt,
      decision.outcome.result.title,
    );
  }
  return decision;
}

export type AdminRetakeRequest = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  curriculumId: string;
  requestedAt: string;
  reason: string;
  availableAt: string;
  closesAt: string;
  provisionalResult: Pick<StoredFinalResult, "mark" | "maxScore" | "passed"> | null;
};

export async function listPendingFinalExamRetakes(
  studentId?: string,
): Promise<AdminRetakeRequest[]> {
  await ensureFinalExamRetakeSchema();
  const rows = await query<{
    student_id: string;
    student_name: string;
    student_email: string;
    curriculum_id: string;
    retake_requested_at: Date;
    retake_reason: string;
    retake_available_at: Date;
    retake_closes_at: Date;
    primary_result: StoredFinalResult | null;
  }>(
    `SELECT final_case.student_id,
            learner.name AS student_name,
            learner.email AS student_email,
            final_case.curriculum_id,
            final_case.retake_requested_at,
            final_case.retake_reason,
            final_case.retake_available_at,
            final_case.retake_closes_at,
            final_case.primary_result
       FROM final_exam_cases AS final_case
       JOIN "user" AS learner
         ON learner."registrationNumber" = final_case.student_id
      WHERE final_case.retake_requested_at IS NOT NULL
        AND final_case.declined_at IS NULL
        AND final_case.retake_exam_id IS NULL
        AND final_case.finalized_at IS NULL
        AND ($1::text IS NULL OR final_case.student_id = $1)
      ORDER BY final_case.retake_requested_at ASC`,
    [studentId ?? null],
  );
  return rows.map((row) => ({
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    curriculumId: row.curriculum_id,
    requestedAt: row.retake_requested_at.toISOString(),
    reason: row.retake_reason,
    availableAt: row.retake_available_at.toISOString(),
    closesAt: row.retake_closes_at.toISOString(),
    provisionalResult: compactResult(row.primary_result),
  }));
}

export async function listPendingFinalExamRetakePage(
  studentId: string | undefined,
  page: number,
  pageSize: number,
): Promise<{
  requests: AdminRetakeRequest[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}> {
  await ensureFinalExamRetakeSchema();
  const count = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM final_exam_cases AS final_case
      WHERE final_case.retake_requested_at IS NOT NULL
        AND final_case.declined_at IS NULL
        AND final_case.retake_exam_id IS NULL
        AND final_case.finalized_at IS NULL
        AND ($1::text IS NULL OR final_case.student_id = $1)`,
    [studentId ?? null],
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), pages);
  const rows = await query<{
    student_id: string;
    student_name: string;
    student_email: string;
    curriculum_id: string;
    retake_requested_at: Date;
    retake_reason: string;
    retake_available_at: Date;
    retake_closes_at: Date;
    primary_result: StoredFinalResult | null;
  }>(
    `SELECT final_case.student_id, learner.name AS student_name,
            learner.email AS student_email, final_case.curriculum_id,
            final_case.retake_requested_at, final_case.retake_reason,
            final_case.retake_available_at, final_case.retake_closes_at,
            final_case.primary_result
       FROM final_exam_cases AS final_case
       JOIN "user" AS learner ON learner."registrationNumber" = final_case.student_id
      WHERE final_case.retake_requested_at IS NOT NULL
        AND final_case.declined_at IS NULL
        AND final_case.retake_exam_id IS NULL
        AND final_case.finalized_at IS NULL
        AND ($1::text IS NULL OR final_case.student_id = $1)
      ORDER BY final_case.retake_requested_at ASC, final_case.curriculum_id ASC
      LIMIT $2 OFFSET $3`,
    [studentId ?? null, pageSize, (normalizedPage - 1) * pageSize],
  );
  return {
    requests: rows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      curriculumId: row.curriculum_id,
      requestedAt: row.retake_requested_at.toISOString(),
      reason: row.retake_reason,
      availableAt: row.retake_available_at.toISOString(),
      closesAt: row.retake_closes_at.toISOString(),
      provisionalResult: compactResult(row.primary_result),
    })),
    pagination: { page: normalizedPage, pageSize, total, pages },
  };
}

/** Reconcile every case whose request or retake deadline has elapsed. */
export async function reconcileDueFinalExamCases(referenceTime: Date): Promise<FinalizationOutcome[]> {
  await ensureFinalExamRetakeSchema();
  const due = await query<{ student_id: string; curriculum_id: string }>(
    `SELECT student_id, curriculum_id
       FROM final_exam_cases
      WHERE finalized_at IS NULL
        AND (
          (retake_requested_at IS NULL AND request_deadline <= $1)
          OR declined_at IS NOT NULL
          OR (retake_requested_at IS NOT NULL AND retake_closes_at <= $1)
          OR retake_result IS NOT NULL
        )
      ORDER BY COALESCE(retake_closes_at, request_deadline) ASC
      LIMIT 200`,
    [referenceTime],
  );
  const outcomes: FinalizationOutcome[] = [];
  for (const item of due) {
    try {
      const outcome = await reconcileFinalExamCase(
        item.student_id,
        item.curriculum_id,
        referenceTime,
      );
      if (outcome?.finalized) outcomes.push(outcome);
    } catch (error) {
      console.error(
        `[finals] could not reconcile ${item.student_id}/${item.curriculum_id}:`,
        error,
      );
    }
  }
  return outcomes;
}
