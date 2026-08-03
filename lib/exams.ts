import { promises as fs } from "fs";
import path from "path";
import { MongoClient, type Db } from "mongodb";
import { env } from "./env";
import { query, queryOne } from "./db";
import { now, HOUR_MS, DAY_MS } from "./clock";
import { getLectures, LECTURES_DIR } from "./lectures";
import { COURSE_SIZES, DEFAULT_SIZE, isCourseSize } from "./course-size";
import { getSetting } from "./settings";
import { isStandalone } from "./runtime";
import { requireTrustedExamLaunchUrl } from "./exam-launch";

/**
 * Integration with the team's exam system (UnivAI-exam_system, port 3200).
 *
 * The exam system owns exams in MongoDB and knows nothing about our virtual
 * clock. Deadlines live HERE: a quiz is takeable for 24 hours after its
 * lecture ends, and the midterm for 3 days after week 4's lecture ends. We
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

const globalForMongo = globalThis as unknown as { univaiMongo?: MongoClient };

async function mongo(): Promise<Db> {
  if (!globalForMongo.univaiMongo) {
    globalForMongo.univaiMongo = await MongoClient.connect(env.MONGODB_URI);
  }
  return globalForMongo.univaiMongo.db();
}

export type ExamLink = {
  /** The app's tenant key (user.studentId, S-YYYY-NNNNNN). */
  sid: string;
  /** The exam system's own Mongo student _id (string). */
  student_id: string;
  curriculum_id: string;
  /** week -> chapter id, so webhook payloads can be mapped back to a week */
  chapters: { week: number; chapter_id: string; title: string }[];
  mid_exam_id: string | null;
};

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
   * The service's verified result — present ONLY for "graded", i.e. the
   * service has confirmed the grade as final. An auto-graded or pending-review
   * verdict is never carried here, so the app can never show an unconfirmed
   * grade. Fields map to the service's result block (mark, passing_mark, passed).
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

  // Only the service's final "graded" verdict releases the result; an
  // auto-graded mark is not verified yet and is never shown.
  if (grading === "graded" && view.result) {
    const { mark, passing_mark: maxScore, passed } = view.result;
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

  // taken with no verified verdict (auto-graded, or no result reported yet).
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
export type ResultWebhook = {
  exam_id: string;
  type: string;
  title: string;
  student_sid?: string | null;
  chapter_id: string | null;
  mark?: number | null;
  total_questions?: number | null;
  passing_mark?: number | null;
  passed?: boolean | null;
  grading_status?: string | null;
  integrity_status?: string | null;
  review_status?: string | null;
  report?: { flagged?: boolean } | null;
};

/**
 * Project a final exam's result callback onto ExamServiceStatusV1, the display
 * contract. The webhook arrives after submission, so the lifecycle is a
 * post-submit verdict driven only by the service's own fields: flagged (its
 * integrity verdict), awaiting-grade (pending_review), graded (its confirmed
 * final, carrying the result), or submitted (auto-graded — reported but not
 * confirmed final, so no result). The proctoring detail in `report` is never
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
    payload.grading_status === "graded" &&
    payload.mark !== null &&
    payload.mark !== undefined &&
    payload.passing_mark !== null &&
    payload.passing_mark !== undefined &&
    payload.passed !== null &&
    payload.passed !== undefined
  ) {
    return {
      ...base,
      state: "graded",
      reason: null,
      result: { mark: payload.mark, max_score: payload.passing_mark, passed: payload.passed },
    };
  }

  // graded but the service omitted the mark — never fabricate one.
  if (payload.grading_status === "graded") {
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
 * fields the exam system sends (grading_status, integrity_status,
 * review_status, mark). Re-delivering the same result reproduces the same
 * fingerprint; a genuinely different event (submit verdict vs manual grade vs
 * regrade) produces a different one, so later events are never deduped away.
 */
export function examCallbackFingerprint(payload: {
  grading_status?: string | null;
  integrity_status?: string | null;
  review_status?: string | null;
  mark?: number | null;
}): string {
  return [
    payload.grading_status ?? "",
    payload.integrity_status ?? "",
    payload.review_status ?? "",
    payload.mark ?? "",
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
 * delete their link + their chapters' question banks, and the docs owned by
 * their exam-system student / curriculum where the owner field is known.
 * (Collection names are mongoose's default pluralisation of the model names.)
 */
export async function resetExamWorld(sid: string): Promise<void> {
  if (isStandalone()) return;
  const db = await mongo();
  const link = await db.collection("univai_link").findOne<ExamLink>({ sid });
  await db.collection("univai_link").deleteMany({ sid });
  if (!link) return;

  const chapterIds = link.chapters.map((c) => c.chapter_id);
  // Find this student's exams (stamped with student_sid by the exam system),
  // then cascade their sessions + proctoring events by exam id.
  const exams = await db
    .collection("exams")
    .find({ student_sid: sid }, { projection: { _id: 1 } })
    .toArray();
  const examIds = exams.map((e) => e._id);

  await Promise.all([
    db.collection("exams").deleteMany({ student_sid: sid }).catch(() => undefined),
    db.collection("examsessions").deleteMany({ exam_id: { $in: examIds } }).catch(() => undefined),
    db.collection("proctoringevents").deleteMany({ exam_id: { $in: examIds } }).catch(() => undefined),
    db.collection("question_banks").deleteMany({ chapter_id: { $in: chapterIds } }).catch(() => undefined),
  ]);
}

/**
 * Copy each week's generated quiz questions (lectures/week-N/quiz.json) into
 * the exam system's question bank, keyed by chapter id. The exam system draws
 * real questions from here instead of its placeholder generator.
 */
export async function syncQuestionBanks(link: ExamLink): Promise<void> {
  const db = await mongo();
  const banks = db.collection("question_banks");

  for (const chapter of link.chapters) {
    let parsed: { title?: string; questions?: unknown[] } | null = null;
    try {
      const raw = await fs.readFile(
        path.join(LECTURES_DIR, link.sid, `week-${chapter.week}`, "quiz.json"),
        "utf-8"
      );
      parsed = JSON.parse(raw);
    } catch {
      continue; // no generated quiz for this week (yet) — the bank stays as-is
    }
    if (!parsed?.questions?.length) continue;

    await banks.updateOne(
      { chapter_id: chapter.chapter_id },
      {
        $set: {
          chapter_id: chapter.chapter_id,
          week: chapter.week,
          title: parsed.title ?? chapter.title,
          questions: parsed.questions,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
  }
}

/** Seed one student's exam world once, and remember the ids (keyed by sid). */
export async function ensureExamWorld(sid: string, studentName: string): Promise<ExamLink> {
  const db = await mongo();
  const links = db.collection("univai_link");

  const existing = await links.findOne<ExamLink & { _id: unknown }>({ sid });
  if (existing?.mid_exam_id) return existing;

  const lectures = await getLectures(sid);

  // Student, Curriculum, Chapters, Enrollment — shapes match the exam system's
  // mongoose models (mongoose validates app-side; the DB accepts plain docs).
  // The app's studentId (sid) is stamped on the exam-system student so results
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

  const book = await queryOne<{ title: string | null; filename: string }>(
    "SELECT title, filename FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1",
    [sid]
  );
  const courseTitle = book?.title ?? book?.filename ?? "UnivAI Course";

  const curricula = db.collection("curricula");
  let curriculum = await curricula.findOne({ title: courseTitle, owner_student_id: student._id });
  if (!curriculum) {
    const inserted = await curricula.insertOne({
      title: courseTitle,
      description: "One Book, One Month — generated by UnivAI",
      owner_student_id: student._id,
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

  // The midterm is PRE-CREATED by the exam system (their createMid), then
  // started later by exam id — exactly the id-handshake the integration uses.
  let midExamId: string | null = null;
  const createMidRes = await fetch(`${EXAM_SYSTEM_URL}/api/exams/mid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      curriculum_id: curriculum._id.toString(),
      title: "Midterm — Weeks 1 to 4",
      chapter_ids: chapters.map((chapter) => chapter.chapter_id),
      passing_mark: 5,
    }),
  }).catch(() => null);

  if (createMidRes?.ok) {
    const midExam = await db.collection("exams").findOne(
      { student_id: student._id, type: "mid" },
      { sort: { _id: -1 } }
    );
    midExamId = midExam?._id.toString() ?? null;
  }

  const link: ExamLink = {
    sid,
    student_id: student._id.toString(),
    curriculum_id: curriculum._id.toString(),
    chapters,
    mid_exam_id: midExamId,
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
      week: null,
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

  const lastLecture = lectures[lectures.length - 1];
  if (lastLecture) {
    const opensAt = lastLecture.endsAt;
    const closesAt = new Date(opensAt.getTime() + MID_WINDOW_MS);
    const grade = grades.find((g) => g.kind === "midterm");

    let state: ExamStatus["state"] = "locked";
    if (grade) state = "submitted";
    else if (virtualNow >= closesAt) state = "missed";
    else if (virtualNow >= opensAt) state = "open";

    statuses.push({
      kind: "mid",
      week: null,
      title: "Midterm — Weeks 1 to 4",
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

  // Course-size dial decides how big the paper is (global default for now).
  const sizeValue = await getSetting("course_size");
  const paper = COURSE_SIZES[isCourseSize(sizeValue) ? sizeValue : DEFAULT_SIZE];

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
        question_count: paper.quizPaper,
      }),
    });
    const exam = await res.json();
    if (!res.ok) throw new Error(exam.error ?? "The exam system refused to start the quiz.");
    return requireTrustedExamLaunchUrl(exam, EXAM_SYSTEM_URL);
  }

  if (!link.mid_exam_id) throw new Error("The midterm was not created yet — is the exam system running?");
  const res = await fetch(`${EXAM_SYSTEM_URL}/api/exams/mid/${link.mid_exam_id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_count: paper.midPaper, student_sid: sid }),
  });
  const exam = await res.json();
  if (!res.ok) throw new Error(exam.error ?? "The exam system refused to start the midterm.");
  return requireTrustedExamLaunchUrl(exam, EXAM_SYSTEM_URL);
}

/** Map a webhook payload back to (kind, week) using that owner's link doc. */
export async function resolveWeek(payload: {
  type: string;
  chapter_id: string | null;
  exam_id: string;
  student_sid?: string;
}): Promise<{ kind: "quiz" | "midterm"; week: number | null }> {
  const db = await mongo();
  const link = await db
    .collection("univai_link")
    .findOne<ExamLink>(payload.student_sid ? { sid: payload.student_sid } : {});
  if (payload.type === "quiz" && payload.chapter_id && link) {
    const chapter = link.chapters.find((c) => c.chapter_id === payload.chapter_id);
    return { kind: "quiz", week: chapter?.week ?? null };
  }
  return { kind: "midterm", week: null };
}
