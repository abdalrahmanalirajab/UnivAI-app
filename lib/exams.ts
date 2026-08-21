import { MongoClient, ObjectId, type Db } from "mongodb";
import { env } from "./env";
import { query, queryOne } from "./db";
import { now, HOUR_MS, DAY_MS } from "./clock";
import { finalExamWindowAt, type FinalExamWindow } from "./final-exam-policy";
import { getLectures } from "./lectures";
import { isStandalone } from "./runtime";
import { requireTrustedExamLaunchUrl } from "./exam-launch";
import { readGeneratedSemesterPlan } from "./semester-plan";
import {
  AssessmentBankOwnershipError,
  buildLearnerQuestionBankDocument,
  type GeneratedLearnerQuizBank,
} from "./assessment-bank-ownership";

/**
 * Integration with the team's exam system (UnivAI-exam_system, port 3200).
 *
 * The exam system owns exams in MongoDB and knows nothing about our virtual
 * clock. Deadlines live HERE: a quiz is takeable for 24 hours after its
 * lecture ends, and the semester midterm for 3 days after its midpoint. We
 * gate access, hand the student over by exam id, and the exam system webhooks
 * the result + proctoring report back to /api/exams/callback.
 *
 * Its domain model needs a Student, a Curriculum, one Chapter per week, and an
 * Enrollment before any exam can exist — ensureExamWorld() seeds those once
 * and remembers the ids in a univai_link document.
 */

export const QUIZ_WINDOW_MS = 24 * HOUR_MS;
export const MID_WINDOW_MS = 3 * DAY_MS;
export const EXAM_SYSTEM_URL = env.EXAM_SYSTEM_URL;
const MIDTERM_CREATION_RETRY_MS = 5 * 60_000;

export function finalExamAvailabilityAt(
  virtualNow: Date,
  lectureEndsAt: Date[],
): FinalExamWindow & { available: boolean } {
  const window = finalExamWindowAt(virtualNow, lectureEndsAt);
  return { ...window, available: window.primaryAvailable };
}

/** The final opens after the last lecture and closes after its recovery window. */
export async function getFinalExamAvailability(
  sid: string,
): Promise<FinalExamWindow & { available: boolean }> {
  const [virtualNow, lectures] = await Promise.all([now(), getLectures(sid)]);
  return finalExamAvailabilityAt(virtualNow, lectures.map((lecture) => lecture.endsAt));
}

const globalForMongo = globalThis as unknown as {
  univaiMongo?: MongoClient;
  univaiMidtermCreations?: Map<string, Promise<void>>;
  univaiMidtermRetryAfter?: Map<string, number>;
};

const midtermCreations = globalForMongo.univaiMidtermCreations ??= new Map();
const midtermRetryAfter = globalForMongo.univaiMidtermRetryAfter ??= new Map();

async function mongo(): Promise<Db> {
  if (!globalForMongo.univaiMongo) {
    globalForMongo.univaiMongo = await MongoClient.connect(env.MONGODB_URI);
  }
  return globalForMongo.univaiMongo.db();
}

export type ExamLink = {
  /** The app's tenant key (user.registrationNumber, S-YYYY-NNNNNN). */
  sid: string;
  /** The exam system's own Mongo student _id (string). */
  student_id: string;
  curriculum_id: string;
  /** week -> chapter id, so webhook payloads can be mapped back to a week */
  chapters: { week: number; chapter_id: string; title: string }[];
  midterms?: { number: number; after_week: number; exam_id: string; title: string }[];
  /** v1 compatibility: the semester midterm. */
  mid_exam_id: string | null;
};

async function plannedMidterms(sid: string): Promise<Array<{
  number: number;
  semester: number;
  afterWeek: number;
  startWeek: number;
  title: string;
}>> {
  const plan = await readGeneratedSemesterPlan(sid);
  if (!plan) return [];
  const result: Array<{
    number: number;
    semester: number;
    afterWeek: number;
    startWeek: number;
    title: string;
  }> = [];
  let offset = 0;
  for (const semester of plan.semesters) {
    const midpoint = Math.ceil(semester.weekCount / 2);
    const afterWeek = offset + midpoint;
    result.push({
      number: semester.semester,
      semester: semester.semester,
      afterWeek,
      startWeek: offset + 1,
      title: `Semester ${semester.semester} Midterm — Weeks ${offset + 1} to ${afterWeek}`,
    });
    offset += semester.weekCount;
  }
  return result;
}

/**
 * A final exam's status as reported BY the Exam service — never derived here.
 *
 * The Exam service owns eligibility, publication, the attempt lifecycle,
 * proctoring, grading, and finality. Every field on this type is echoed from
 * the service's own response (ExamAttemptView from GET /api/exams/[examId] or
 * the start routes, or the result webhook), and the app only renders it.
 * In particular, "locked"/"unavailable" and their `reason` come from the
 * service as-is (its 403 denial message or `lock_reason`) — there is no
 * app-side eligibility or grading computation behind any of these values.
 *
 * Schema version: 1.0.0
 */
export type ExamServiceStatusV1 = {
  /** The Exam service's exam id (ExamAttemptView._id / webhook exam_id). */
  exam_id: string;
  /** The exam title the Exam service assigned (ExamAttemptView.title). */
  title: string;
  /** The exam kind the Exam service reports — finals only for now. */
  type: "final";
  /**
   * The lifecycle phase the Exam service reports:
   * - "unavailable": the service has no exam for this learner (e.g. 404).
   * - "locked": the service refused to start it, with a `reason`
   *   (eligibility denial or an integrity lock).
   * - "ready": published, no attempt started yet.
   * - "active": an attempt is in progress (service `integrity_state` "active").
   * - "submitted": submitted, result not final yet.
   * - "awaiting-grade": service `result.grading_status` "pending_review".
   * - "graded": service `result.grading_status` "graded" — final.
   * - "flagged": service `integrity_status` "invalidated".
   */
  state:
    | "locked"
    | "ready"
    | "active"
    | "submitted"
    | "awaiting-grade"
    | "graded"
    | "flagged"
    | "unavailable";
  /** The Exam service's own reason — set for "locked" and "unavailable". */
  reason: string | null;
  /**
   * The service's clean scored result. Auto-graded and manually graded finals
   * are shown immediately; pending-review and invalidated attempts stay hidden.
   */
  result: {
    mark: number;
    max_score: number;
    passed: boolean;
  } | null;
};

/**
 * The subset of the Exam service's attempt view (its ExamAttemptView shape)
 * that the final-exam status projection reads. Every field maps 1:1 to the
 * service's own response — nothing here is computed by this app.
 */
export type FinalExamAttemptView = {
  _id: string;
  title: string;
  taken: boolean;
  integrity_status: "clean" | "invalidated";
  integrity_state: "active" | "reconnecting" | "grace" | "integrity_locked" | "submitted";
  lock_reason?: string;
  progress?: { total: number };
  result?: {
    grading_status: "auto_graded" | "pending_review" | "graded";
    mark?: number;
    passing_mark?: number;
    passed: boolean;
  };
};

/**
 * Project the Exam service's attempt view onto ExamServiceStatusV1, the
 * display contract. This renames the service's own reported fields — eligibility,
 * grading and finality were already decided service-side; we never recompute
 * any of them here, and a flagged attempt stays a bare "flagged" (the risk
 * detail belongs to Exam reviewers, not this projection).
 */
export function toFinalExamStatus(view: FinalExamAttemptView): ExamServiceStatusV1 {
  const base = {
    exam_id: view._id,
    title: view.title,
    type: "final" as const,
  };

  // An integrity lock is the service's own state — its reason is relayed as-is.
  if (view.integrity_state === "integrity_locked") {
    return { ...base, state: "locked", reason: view.lock_reason ?? null, result: null };
  }

  if (!view.taken) {
    const inProgress =
      view.integrity_state === "active" ||
      view.integrity_state === "reconnecting" ||
      view.integrity_state === "grace";
    return { ...base, state: inProgress ? "active" : "ready", reason: null, result: null };
  }

  // An invalidated attempt is flagged — the learner learns the flag exists,
  // never the proctoring detail that caused it.
  if (view.integrity_status === "invalidated") {
    return { ...base, state: "flagged", reason: null, result: null };
  }

  const grading = view.result?.grading_status;
  if (grading === "pending_review") {
    return { ...base, state: "awaiting-grade", reason: null, result: null };
  }

  // A clean score is ready immediately, whether automatic or manually graded.
  if ((grading === "auto_graded" || grading === "graded") && view.result) {
    const { mark, passed } = view.result;
    const maxScore = view.progress?.total;
    return {
      ...base,
      state: "graded",
      reason: null,
      result:
        mark !== undefined && maxScore !== undefined
          ? { mark, max_score: maxScore, passed }
          : null,
    };
  }

  // Taken with no scored verdict reported yet.
  return { ...base, state: "submitted", reason: null, result: null };
}

let finalStatusSchemaPromise: Promise<void> | null = null;

/**
 * Session-scoped copy of the last status the Exam service reported for this
 * learner's final (captured from the start-final response — the service has
 * no status endpoint reachable without the attempt token, which lives only in
 * the browser fragment). The app only caches what the service reported; it
 * never transitions state itself. Additive and idempotent, like
 * ensureFeedbackSchema.
 */
function ensureFinalExamStatusSchema(): Promise<void> {
  finalStatusSchemaPromise ??= query(`
    CREATE TABLE IF NOT EXISTS final_exam_status (
      student_id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('locked','ready','active','submitted','awaiting-grade','graded','flagged','unavailable')),
      reason TEXT,
      result JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
    .then(() => undefined)
    .catch((error) => {
      finalStatusSchemaPromise = null;
      throw error;
    });
  return finalStatusSchemaPromise;
}

/** Remember the status the Exam service reported for this learner's final. */
export async function saveFinalExamStatus(
  sid: string,
  status: ExamServiceStatusV1
): Promise<void> {
  await ensureFinalExamStatusSchema();
  await query(
    `INSERT INTO final_exam_status (student_id, exam_id, title, state, reason, result, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (student_id) DO UPDATE SET
       exam_id = EXCLUDED.exam_id,
       title = EXCLUDED.title,
       state = EXCLUDED.state,
       reason = EXCLUDED.reason,
       result = EXCLUDED.result,
       updated_at = CURRENT_TIMESTAMP`,
    [
      sid,
      status.exam_id,
      status.title,
      status.state,
      status.reason,
      status.result ? JSON.stringify(status.result) : null,
    ]
  );
}

/**
 * The learner's last service-reported final status, or null when the Exam
 * service has never reported one (nothing stored yet). Null means the app
 * has no service word on the final — the page shows "unavailable" and does
 * not guess why.
 */
export async function getFinalExamStatus(sid: string): Promise<ExamServiceStatusV1 | null> {
  await ensureFinalExamStatusSchema();
  const row = await queryOne<{
    exam_id: string;
    title: string;
    state: string;
    reason: string | null;
    result: ExamServiceStatusV1["result"] | null;
  }>("SELECT exam_id, title, state, reason, result FROM final_exam_status WHERE student_id = $1", [
    sid,
  ]);
  if (!row) return null;
  return {
    exam_id: row.exam_id,
    title: row.title,
    type: "final",
    state: row.state as ExamServiceStatusV1["state"],
    reason: row.reason,
    result: row.result,
  };
}

/**
 * The result-callback payload the exam system webhooks to /api/exams/callback
 * (its resultWebhookSchema). Only the fields this app may rely on are listed;
 * anything else the service might send is treated as unsafe and dropped.
 */
export type ResultWebhookAssessmentType = "quiz" | "mid" | "final";
export type ResultWebhookGradingStatus = "auto_graded" | "pending_review" | "graded";
export type ResultWebhookIntegrityStatus = "clean" | "invalidated";
export type ResultWebhookReviewStatus = "not_required" | "pending" | "cleared" | "upheld";

/** Accept only assessment kinds defined by the Exam service callback contract. */
export function isResultWebhookAssessmentType(
  value: unknown,
): value is ResultWebhookAssessmentType {
  return value === "quiz" || value === "mid" || value === "final";
}

async function requestMidtermCreation(input: {
  key: string;
  sid: string;
  curriculumId: string;
  studentId: string;
  title: string;
  chapterIds: string[];
}): Promise<void> {
  if ((midtermRetryAfter.get(input.key) ?? 0) > Date.now()) return;

  let creation = midtermCreations.get(input.key);
  if (!creation) {
    creation = (async () => {
      const response = await fetch(`${EXAM_SYSTEM_URL}/api/exams/mid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum_id: input.curriculumId,
          student_id: input.studentId,
          student_sid: input.sid,
          title: input.title,
          chapter_ids: input.chapterIds,
          passing_mark: 5,
        }),
      }).catch(() => null);

      if (response?.ok) {
        midtermRetryAfter.delete(input.key);
        return;
      }

      midtermRetryAfter.set(input.key, Date.now() + MIDTERM_CREATION_RETRY_MS);
      const detail = response
        ? (await response.text().catch(() => "")).slice(0, 300)
        : "exam service unavailable";
      console.error(`[exams] midterm preparation failed for ${input.sid}; retrying later: ${detail}`);
    })().finally(() => {
      midtermCreations.delete(input.key);
    });
    midtermCreations.set(input.key, creation);
  }
  await creation;
}

export type ResultWebhook = {
  exam_id: string;
  type: ResultWebhookAssessmentType;
  title: string;
  student_sid: string;
  chapter_id: string | null;
  attempt_number: number;
  final_form: "primary" | "retake" | null;
  mark: number | null;
  total_questions: number;
  max_score: number;
  passing_mark: number | null;
  passed: boolean;
  grading_status: ResultWebhookGradingStatus;
  integrity_status: ResultWebhookIntegrityStatus;
  review_status: ResultWebhookReviewStatus;
  report: { flagged: boolean; [key: string]: unknown };
};

export type ResultWebhookParseResult =
  | { ok: true; payload: ResultWebhook }
  | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableScore(value: unknown, maximum: number): value is number | null {
  return value === null || (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
  );
}

/** Validate the signed callback at runtime against the fields this app consumes. */
export function parseResultWebhook(value: unknown): ResultWebhookParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Malformed callback payload." };
  }

  const payload = value as Record<string, unknown>;
  if (!isResultWebhookAssessmentType(payload.type)) {
    return { ok: false, error: "type must be one of: quiz, mid, final" };
  }
  if (!isNonEmptyString(payload.exam_id)) {
    return { ok: false, error: "exam_id must be a non-empty string" };
  }
  if (!isNonEmptyString(payload.title)) {
    return { ok: false, error: "title must be a non-empty string" };
  }
  if (!isNonEmptyString(payload.student_sid)) {
    return { ok: false, error: "student_sid must be a non-empty string" };
  }
  if (!(payload.chapter_id === null || isNonEmptyString(payload.chapter_id))) {
    return { ok: false, error: "chapter_id must be a non-empty string or null" };
  }
  const attemptNumber = payload.attempt_number === undefined ? 1 : payload.attempt_number;
  if (
    typeof attemptNumber !== "number" ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    return { ok: false, error: "attempt_number must be a positive safe integer" };
  }
  const finalForm = payload.final_form === undefined
    ? payload.type === "final" ? "primary" : null
    : payload.final_form;
  if (
    !(
      finalForm === null ||
      (payload.type === "final" && (finalForm === "primary" || finalForm === "retake"))
    )
  ) {
    return { ok: false, error: "final_form must identify a final form or be null" };
  }
  if (
    typeof payload.total_questions !== "number" ||
    !Number.isSafeInteger(payload.total_questions) ||
    payload.total_questions < 0
  ) {
    return { ok: false, error: "total_questions must be a non-negative safe integer" };
  }
  // Compatibility for callbacks already in flight during a rolling deploy.
  // New producers always send max_score explicitly. Legacy manual-final marks
  // use a percentage scale; objective results use one point per question.
  const maxScore = payload.max_score === undefined
    ? payload.type === "final" && payload.grading_status !== "auto_graded"
      ? 100
      : payload.total_questions
    : payload.max_score;
  if (
    typeof maxScore !== "number" ||
    !Number.isSafeInteger(maxScore) ||
    maxScore < 0
  ) {
    return { ok: false, error: "max_score must be a non-negative safe integer" };
  }
  if (!isNullableScore(payload.mark, maxScore)) {
    return { ok: false, error: "mark must be null or between 0 and max_score" };
  }
  if (!isNullableScore(payload.passing_mark, maxScore)) {
    return { ok: false, error: "passing_mark must be null or between 0 and max_score" };
  }
  if (typeof payload.passed !== "boolean") {
    return { ok: false, error: "passed must be a boolean" };
  }
  if (
    payload.grading_status !== "auto_graded" &&
    payload.grading_status !== "pending_review" &&
    payload.grading_status !== "graded"
  ) {
    return { ok: false, error: "Invalid grading_status" };
  }
  if (payload.integrity_status !== "clean" && payload.integrity_status !== "invalidated") {
    return { ok: false, error: "Invalid integrity_status" };
  }
  if (
    payload.review_status !== "not_required" &&
    payload.review_status !== "pending" &&
    payload.review_status !== "cleared" &&
    payload.review_status !== "upheld"
  ) {
    return { ok: false, error: "Invalid review_status" };
  }
  if (
    !payload.report ||
    typeof payload.report !== "object" ||
    Array.isArray(payload.report) ||
    typeof (payload.report as Record<string, unknown>).flagged !== "boolean"
  ) {
    return { ok: false, error: "report.flagged must be a boolean" };
  }

  return {
    ok: true,
    payload: {
      exam_id: payload.exam_id,
      type: payload.type,
      title: payload.title,
      student_sid: payload.student_sid,
      chapter_id: payload.chapter_id,
      attempt_number: attemptNumber,
      final_form: finalForm,
      mark: payload.mark,
      total_questions: payload.total_questions,
      max_score: maxScore,
      passing_mark: payload.passing_mark,
      passed: payload.passed,
      grading_status: payload.grading_status,
      integrity_status: payload.integrity_status,
      review_status: payload.review_status,
      report: payload.report as ResultWebhook["report"],
    },
  };
}

/**
 * Project a final exam's result callback onto ExamServiceStatusV1, the display
 * contract. The webhook arrives after submission, so the lifecycle is a
 * post-submit verdict driven only by the service's own fields: flagged (its
 * integrity verdict), awaiting-grade (pending_review), graded (a clean automatic
 * or manual result), or submitted (no scored verdict). The proctoring detail is never
 * carried into the projection.
 */
export function webhookToFinalExamStatus(payload: ResultWebhook): ExamServiceStatusV1 {
  const base = {
    exam_id: payload.exam_id,
    title: payload.title,
    type: "final" as const,
  };

  if (payload.integrity_status === "invalidated" || payload.report?.flagged) {
    return { ...base, state: "flagged", reason: null, result: null };
  }

  if (payload.grading_status === "pending_review") {
    return { ...base, state: "awaiting-grade", reason: null, result: null };
  }

  if (
    (payload.grading_status === "auto_graded" || payload.grading_status === "graded") &&
    payload.mark !== null &&
    payload.mark !== undefined &&
    payload.total_questions !== null &&
    payload.total_questions !== undefined &&
    payload.passed !== null &&
    payload.passed !== undefined
  ) {
    return {
      ...base,
      state: "graded",
      reason: null,
      result: { mark: payload.mark, max_score: payload.max_score, passed: payload.passed },
    };
  }

  // Scored verdict but the service omitted the mark — never fabricate one.
  if (payload.grading_status === "auto_graded" || payload.grading_status === "graded") {
    return { ...base, state: "graded", reason: null, result: null };
  }

  return { ...base, state: "submitted", reason: null, result: null };
}

let callbackEventsSchemaPromise: Promise<void> | null = null;

/**
 * Deduplication ledger for result callbacks. The exam system may re-deliver a
 * callback; a row here means that exact event (same exam id + same event
 * fingerprint) was already processed and must not be re-applied. Additive and
 * idempotent, like ensureFeedbackSchema.
 */
function ensureExamCallbackEventsSchema(): Promise<void> {
  callbackEventsSchemaPromise ??= query(`
    CREATE TABLE IF NOT EXISTS exam_callback_events (
      exam_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (exam_id, fingerprint)
    );
  `)
    .then(() => undefined)
    .catch((error) => {
      callbackEventsSchemaPromise = null;
      throw error;
    });
  return callbackEventsSchemaPromise;
}

/**
 * The event fingerprint for a result callback, built ONLY from real payload
 * fields the app persists or projects. Re-delivering the same result reproduces
 * the same fingerprint; a changed verdict, score scale, pass threshold, or
 * proctoring flag produces a different one, so corrected events are never
 * deduped away.
 */
export function examCallbackFingerprint(payload: ResultWebhook): string {
  return [
    payload.type,
    payload.grading_status,
    payload.integrity_status,
    payload.review_status,
    payload.attempt_number,
    payload.final_form ?? "",
    payload.mark ?? "",
    payload.max_score,
    payload.passing_mark ?? "",
    payload.passed,
    payload.report.flagged,
  ].join("|");
}

/** True when this exact callback event (exam id + fingerprint) was already processed. */
export async function wasExamCallbackProcessed(examId: string, fingerprint: string): Promise<boolean> {
  await ensureExamCallbackEventsSchema();
  const rows = await query<{ exam_id: string }>(
    "SELECT exam_id FROM exam_callback_events WHERE exam_id = $1 AND fingerprint = $2",
    [examId, fingerprint]
  );
  return rows.length > 0;
}

/** Remember that this callback event was processed (idempotent insert). */
export async function recordExamCallback(examId: string, fingerprint: string): Promise<void> {
  await ensureExamCallbackEventsSchema();
  await query(
    "INSERT INTO exam_callback_events (exam_id, fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [examId, fingerprint]
  );
}

/**
 * Wipe ONE student's seeded exam world (used when they replace their book).
 * Scoped by owner so re-uploading never destroys another student's exams. We
 * Delete every learner-owned assessment binding before a replacement book is
 * linked: immutable papers, attempts, grades, provenance, banks, chapters,
 * enrollments, and curricula. Audit logs remain as durable audit evidence.
 */
export async function resetExamWorld(sid: string): Promise<void> {
  if (isStandalone()) return;
  const db = await mongo();
  const link = await db.collection("univai_link").findOne<ExamLink>({ sid });
  const student = link?.student_id && ObjectId.isValid(link.student_id)
    ? await db.collection("students").findOne(
        { _id: new ObjectId(link.student_id), sid },
        { projection: { _id: 1 } },
      )
    : await db.collection("students").findOne({ sid }, { projection: { _id: 1 } });
  if (!student) {
    await db.collection("univai_link").deleteMany({ sid });
    return;
  }

  const studentId = student._id;
  const curricula = await db.collection("curricula").find(
    { owner_student_id: studentId },
    { projection: { _id: 1 } },
  ).toArray();
  const curriculumIds = curricula.map((curriculum) => curriculum._id);
  const chapters = await db.collection("chapters").find(
    { curriculum_id: { $in: curriculumIds } },
    { projection: { _id: 1 } },
  ).toArray();
  const chapterIds = chapters.map((chapter) => chapter._id);

  const exams = await db
    .collection("exams")
    .find(
      { $or: [{ student_sid: sid }, { student_id: studentId }] },
      { projection: { _id: 1 } },
    )
    .toArray();
  const examIds = exams.map((e) => e._id);

  await Promise.all([
    db.collection("examsessions").deleteMany({ exam_id: { $in: examIds } }),
    db.collection("proctoringevents").deleteMany({ exam_id: { $in: examIds } }),
    db.collection("integrityevents").deleteMany({ exam_id: { $in: examIds } }),
    db.collection("integrityappeals").deleteMany({ exam_id: { $in: examIds } }),
    db.collection("gradehistories").deleteMany({ exam_id: { $in: examIds } }),
    db.collection("examattemptrecords").deleteMany({ learner_id: studentId }),
    db.collection("examchapters").deleteMany({
      $or: [{ exam_id: { $in: examIds } }, { chapter_id: { $in: chapterIds } }],
    }),
    db.collection("question_banks").deleteMany({
      $or: [
        { owner_sid: sid },
        { student_id: studentId.toString() },
        { chapter_id: { $in: chapterIds.map((id) => id.toString()) } },
      ],
    }),
    db.collection("questionprovenances").deleteMany({
      $or: [
        { learner_id: { $in: [sid, studentId.toString()] } },
        { curriculum_id: { $in: curriculumIds } },
        { chapter_id: { $in: chapterIds } },
      ],
    }),
    db.collection("midtermpublications").deleteMany({
      curriculum_id: { $in: curriculumIds },
    }),
    db.collection("assessmentblueprints").deleteMany({
      course_id: { $in: curriculumIds.map((id) => id.toString()) },
    }),
    db.collection("enrollments").deleteMany({ student_id: studentId }),
    db.collection("exams").deleteMany({
      $or: [{ student_sid: sid }, { student_id: studentId }],
    }),
  ]);
  await db.collection("chapters").deleteMany({ curriculum_id: { $in: curriculumIds } });
  await db.collection("curricula").deleteMany({ _id: { $in: curriculumIds } });
  await db.collection("univai_link").deleteMany({ sid });
}

/**
 * Copy each week's generated quiz payload from Postgres into
 * the exam system's question bank, keyed by chapter id. The exam system draws
 * real questions from here instead of its placeholder generator.
 */
export async function syncQuestionBanks(link: ExamLink): Promise<void> {
  const db = await mongo();
  const banks = db.collection("question_banks");

  for (const chapter of link.chapters) {
    const bindingFilter = {
      chapter_id: chapter.chapter_id,
      owner_sid: link.sid,
      student_id: link.student_id,
      curriculum_id: link.curriculum_id,
    };
    let source: {
      book_id: number;
      artifact_id: string;
      artifact_student_id: string;
      quiz_payload: GeneratedLearnerQuizBank | null;
    } | null = null;
    try {
      const rows = await query<{
        book_id: number;
        artifact_id: string;
        artifact_student_id: string;
        quiz_payload: GeneratedLearnerQuizBank | null;
      }>(
        `SELECT la.book_id, la.artifact_id::text AS artifact_id,
                la.student_id AS artifact_student_id, la.quiz_payload
           FROM lectures l
           JOIN lecture_artifacts la ON la.artifact_id = l.lecture_artifact_id
          WHERE l.student_id = $1 AND l.week = $2`,
        [link.sid, chapter.week]
      );
      source = rows[0] ?? null;
    } catch {
      await banks.deleteMany(bindingFilter);
      throw new AssessmentBankOwnershipError(
        `Could not verify week ${chapter.week} assessment ownership. Try again after regeneration.`,
      );
    }
    if (!source?.quiz_payload) {
      await banks.deleteMany(bindingFilter);
      throw new AssessmentBankOwnershipError(
        `Week ${chapter.week} assessment bank is not ready; regenerate its quizzes.`,
      );
    }
    if (source.artifact_student_id !== link.sid) {
      await banks.deleteMany(bindingFilter);
      throw new AssessmentBankOwnershipError(
        `Week ${chapter.week} lecture artifact belongs to another learner.`,
      );
    }

    let document;
    try {
      document = buildLearnerQuestionBankDocument({
        scope: link,
        chapter,
        sourceBookId: source.book_id,
        sourceArtifactId: source.artifact_id,
        payload: source.quiz_payload,
      });
    } catch (error) {
      await banks.deleteMany(bindingFilter);
      throw error;
    }

    await banks.replaceOne(
      bindingFilter,
      document,
      { upsert: true }
    );
  }
}

/** Seed one student's exam world once, and remember the ids (keyed by sid). */
export async function ensureExamWorld(sid: string, studentName: string): Promise<ExamLink> {
  const db = await mongo();
  const links = db.collection("univai_link");

  const midtermPlans = await plannedMidterms(sid);

  const lectures = await getLectures(sid);

  // Student, Curriculum, Chapters, Enrollment — shapes match the exam system's
  // mongoose models (mongoose validates app-side; the DB accepts plain docs).
  // The app's registrationNumber (sid) is stamped on the exam-system student so results
  // route back to the right owner.
  const students = db.collection("students");
  let student = await students.findOne({ sid });
  if (!student) {
    const inserted = await students.insertOne({
      name: studentName,
      sid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    student = { _id: inserted.insertedId, name: studentName, sid };
  }

  const book = await queryOne<{
    id: number;
    title: string | null;
    filename: string;
    source_sha256: string | null;
  }>(
    "SELECT id, title, filename, source_sha256 FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1",
    [sid]
  );
  if (!book) throw new Error("No generated book exists for this learner.");
  const courseTitle = book.title ?? book.filename;

  const curricula = db.collection("curricula");
  let curriculum = await curricula.findOne({
    owner_student_id: student._id,
    source_book_id: book.id,
    source_sha256: book.source_sha256,
  });
  if (!curriculum) {
    const inserted = await curricula.insertOne({
      title: courseTitle,
      description: "One book, one chapter-derived course — generated by UnivAI",
      owner_student_id: student._id,
      source_book_id: book.id,
      source_sha256: book.source_sha256,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    curriculum = { _id: inserted.insertedId, title: courseTitle };
  }

  const chaptersCol = db.collection("chapters");
  const chapters: ExamLink["chapters"] = [];
  for (const lecture of lectures) {
    let chapter = await chaptersCol.findOne({
      curriculum_id: curriculum._id,
      number: lecture.week,
    });
    if (!chapter) {
      const inserted = await chaptersCol.insertOne({
        curriculum_id: curriculum._id,
        title: lecture.title,
        number: lecture.week,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      chapter = { _id: inserted.insertedId };
    }
    chapters.push({
      week: lecture.week,
      chapter_id: chapter._id.toString(),
      title: lecture.title,
    });
  }

  const enrollments = db.collection("enrollments");
  const enrollment = await enrollments.findOne({
    student_id: student._id,
    curriculum_id: curriculum._id,
  });
  if (!enrollment) {
    await enrollments.insertOne({
      student_id: student._id,
      curriculum_id: curriculum._id,
      enrolled_at: new Date(),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const assessmentScope: ExamLink = {
    sid,
    student_id: student._id.toString(),
    curriculum_id: curriculum._id.toString(),
    chapters,
    midterms: [],
    mid_exam_id: null,
  };
  // A cumulative paper may only be assembled after this learner's generated
  // banks have been validated and bound to their Exam identities.
  await syncQuestionBanks(assessmentScope);

  // One midterm is pre-created at each semester's midpoint and covers its
  // completed first-half lectures.
  const midterms: NonNullable<ExamLink["midterms"]> = [];
  for (const planned of midtermPlans) {
    const chapterIds = chapters
      .filter((chapter) => chapter.week >= planned.startWeek && chapter.week <= planned.afterWeek)
      .map((chapter) => chapter.chapter_id);
    const examFilter = {
      student_id: student._id,
      curriculum_id: curriculum._id,
      type: "mid",
      title: planned.title,
    };
    let midExam = await db.collection("exams").findOne(
      examFilter,
      { sort: { _id: -1 } },
    );
    const boundChapterCount = midExam
      ? await db.collection("examchapters").countDocuments({
          exam_id: midExam._id,
          chapter_id: { $in: chapterIds.map((chapterId) => new ObjectId(chapterId)) },
        })
      : 0;
    if (!midExam || boundChapterCount !== chapterIds.length) {
      await requestMidtermCreation({
        key: `${sid}:${curriculum._id}:${planned.number}`,
        sid,
        curriculumId: curriculum._id.toString(),
        studentId: student._id.toString(),
        title: planned.title,
        chapterIds,
      });
      midExam = await db.collection("exams").findOne(
        examFilter,
        { sort: { _id: -1 } },
      );
    }
    if (midExam) {
      midterms.push({
        number: planned.number,
        after_week: planned.afterWeek,
        exam_id: midExam._id.toString(),
        title: planned.title,
      });
    }
  }

  const link: ExamLink = {
    sid,
    student_id: student._id.toString(),
    curriculum_id: curriculum._id.toString(),
    chapters,
    midterms,
    mid_exam_id: midterms[0]?.exam_id ?? null,
  };
  await links.updateOne({ sid }, { $set: link }, { upsert: true });
  return link;
}

export type ExamStatus = {
  kind: "quiz" | "mid";
  week: number | null;
  title: string;
  opensAt: Date;
  closesAt: Date;
  state: "locked" | "open" | "missed" | "submitted";
  score: string | null;
  maxScore: string | null;
  flagged: boolean;
  feedback: string | null;
};

// The proctoring report itself (suspicion score, per-event weights, session
// detail) is NEVER part of this shape: it is stored server-side for Exam
// reviewers, and only the flagged verdict reaches the client.

/** Every exam with its window (virtual clock) and result, for the /exams page. */
export async function getExamStatuses(sid: string): Promise<ExamStatus[]> {
  if (isStandalone()) {
    const anchor = new Date("2026-07-27T09:00:00.000Z");
    const hour = 60 * 60 * 1000;
    const scenario = process.env.UNIVAI_SCENARIO ?? "happy";
    const statuses: ExamStatus[] = [1, 2, 3, 4].map((week) => ({
      kind: "quiz",
      week,
      title: `Quiz ${week} - Standalone Week ${week}`,
      opensAt: new Date(anchor.getTime() + (week - 1) * 7 * 24 * hour),
      closesAt: new Date(anchor.getTime() + (week - 1) * 7 * 24 * hour + 24 * hour),
      state:
        week === 1
          ? "submitted"
          : week === 2 && scenario !== "empty"
            ? "open"
            : "locked",
      score: week === 1 ? "4" : null,
      maxScore: week === 1 ? "5" : null,
      flagged: week === 4 && scenario === "exam-complete",
      feedback: week === 1 ? "Good use of source evidence." : null,
    }));
    statuses.push({
      kind: "mid",
      week: 4,
      title: "Midterm - Weeks 1 to 4",
      opensAt: new Date("2026-08-18T11:00:00.000Z"),
      closesAt: new Date("2026-08-21T11:00:00.000Z"),
      state: scenario === "exam-pending" ? "submitted" : "locked",
      score: scenario === "exam-pending" ? "pending" : null,
      maxScore: scenario === "exam-pending" ? "manual review" : null,
      flagged: false,
      feedback: scenario === "exam-pending" ? "Pending manual grading." : null,
    });
    return statuses;
  }

  const [virtualNow, lectures] = await Promise.all([now(), getLectures(sid)]);

  const grades = await query<{
    kind: string;
    week: number | null;
    score: string;
    max_score: string;
    flagged: boolean;
    feedback: string | null;
  }>(
    // The proctoring report column exists server-side for reviewers but is
    // deliberately not selected here — it never enters a client response.
    "SELECT kind, week, score, max_score, flagged, feedback FROM grades WHERE student_id = $1",
    [sid]
  );

  const statuses: ExamStatus[] = [];

  for (const lecture of lectures) {
    const opensAt = lecture.endsAt;
    const closesAt = new Date(opensAt.getTime() + QUIZ_WINDOW_MS);
    const grade = grades.find((g) => g.kind === "quiz" && g.week === lecture.week);

    let state: ExamStatus["state"] = "locked";
    if (grade) state = "submitted";
    else if (virtualNow >= closesAt) state = "missed";
    else if (virtualNow >= opensAt) state = "open";

    statuses.push({
      kind: "quiz",
      week: lecture.week,
      title: `Quiz ${lecture.week} — ${lecture.title}`,
      opensAt,
      closesAt,
      state,
      score: grade?.score ?? null,
      maxScore: grade?.max_score ?? null,
      flagged: grade?.flagged ?? false,
      feedback: grade?.feedback ?? null,
    });
  }

  const midtermPlans = await plannedMidterms(sid);
  for (const [index, midterm] of midtermPlans.entries()) {
    const boundaryLecture = lectures.find((lecture) => lecture.week === midterm.afterWeek);
    if (!boundaryLecture) continue;
    const opensAt = boundaryLecture.endsAt;
    const closesAt = new Date(opensAt.getTime() + MID_WINDOW_MS);
    const grade = grades.find(
      (candidate) =>
        candidate.kind === "midterm" &&
        (candidate.week === midterm.afterWeek || (index === 0 && candidate.week === null)),
    );

    let state: ExamStatus["state"] = "locked";
    if (grade) state = "submitted";
    else if (virtualNow >= closesAt) state = "missed";
    else if (virtualNow >= opensAt) state = "open";

    statuses.push({
      kind: "mid",
      week: midterm.afterWeek,
      title: midterm.title,
      opensAt,
      closesAt,
      state,
      score: grade?.score ?? null,
      maxScore: grade?.max_score ?? null,
      flagged: grade?.flagged ?? false,
      feedback: grade?.feedback ?? null,
    });
  }

  return statuses;
}

/** Start (or resume) one student's exam and return the URL they take it at. */
export async function startExam(
  sid: string,
  studentName: string,
  kind: "quiz" | "mid",
  week: number | null
): Promise<string> {
  const statuses = await getExamStatuses(sid);
  const status = statuses.find((s) => s.kind === kind && s.week === week);
  if (!status) throw new Error("No such exam.");
  if (status.state === "locked")
    throw new Error(`Not open yet — it opens after the lecture, ${status.opensAt.toISOString()}.`);
  if (status.state === "missed") throw new Error("The window for this exam has closed.");
  if (status.state === "submitted") throw new Error("You already submitted this exam.");
  if (isStandalone()) {
    return `/exams?standalone_attempt=${kind}-${week ?? "mid"}`;
  }

  const link = await ensureExamWorld(sid, studentName);
  // Push the freshest generated questions into the bank BEFORE the exam system
  // assembles the exam — this is what makes the quiz be about the lecture.
  await syncQuestionBanks(link);

  if (kind === "quiz") {
    const chapter = link.chapters.find((c) => c.week === week);
    if (!chapter) throw new Error("No chapter for that week.");
    const res = await fetch(`${EXAM_SYSTEM_URL}/api/exams/quiz/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: link.student_id,
        // Carried through so the exam system can echo it in the result webhook,
        // routing the grade back to this owner (see /api/exams/callback).
        student_sid: sid,
        chapter_id: chapter.chapter_id,
      }),
    });
    const exam = await res.json();
    if (!res.ok) throw new Error(exam.error ?? "The exam system refused to start the quiz.");
    return requireTrustedExamLaunchUrl(exam, EXAM_SYSTEM_URL);
  }

  const midtermId = link.midterms?.find((midterm) => midterm.after_week === week)?.exam_id
    ?? (week === null ? link.mid_exam_id : null);
  if (!midtermId) throw new Error("The midterm was not created yet — is the exam system running?");
  const res = await fetch(`${EXAM_SYSTEM_URL}/api/exams/mid/${midtermId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: link.student_id, student_sid: sid }),
  });
  const exam = await res.json();
  if (!res.ok) throw new Error(exam.error ?? "The exam system refused to start the midterm.");
  return requireTrustedExamLaunchUrl(exam, EXAM_SYSTEM_URL);
}

/** Map a webhook payload back to (kind, week) using that owner's link doc. */
export async function resolveWeek(payload: {
  type: Exclude<ResultWebhookAssessmentType, "final">;
  chapter_id: string | null;
  exam_id: string;
  student_sid?: string;
}): Promise<{ kind: "quiz" | "midterm"; week: number | null }> {
  const db = await mongo();
  const link = await db
    .collection("univai_link")
    .findOne<ExamLink>(payload.student_sid ? { sid: payload.student_sid } : {});
  if (payload.type === "quiz") {
    const chapter = payload.chapter_id && link
      ? link.chapters.find((candidate) => candidate.chapter_id === payload.chapter_id)
      : null;
    return { kind: "quiz", week: chapter?.week ?? null };
  }
  if (payload.type === "mid") {
    const midterm = link?.midterms?.find((candidate) => candidate.exam_id === payload.exam_id);
    return { kind: "midterm", week: midterm?.after_week ?? null };
  }

  // The input type is exhaustive at compile time and guarded at the callback
  // boundary. Keep a runtime failure here as defense against untyped callers.
  throw new Error(`Unsupported assessment type: ${String(payload.type)}`);
}
