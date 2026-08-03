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
};

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

export type ProctoringReport = {
  suspicion_score?: number;
  flagged?: boolean;
  session_status?: string;
  events?: { type: string; weight: number; occurrences: number; at: string }[];
};

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
  /** the proctoring report the exam system sent back — admin view for now */
  report: ProctoringReport | null;
};

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
      report:
        week === 1
          ? { suspicion_score: 0, flagged: false, session_status: "completed", events: [] }
          : null,
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
      report: null,
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
    report: ProctoringReport | null;
  }>(
    "SELECT kind, week, score, max_score, flagged, feedback, report FROM grades WHERE student_id = $1",
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
      report: grade?.report ?? null,
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
      report: grade?.report ?? null,
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
