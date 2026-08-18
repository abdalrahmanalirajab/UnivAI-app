import { createHash } from "node:crypto";

import { pool, query, queryOne } from "./db";
import { DAY_MS } from "./clock";
import { readGeneratedSemesterPlan } from "./semester-plan";

export const COURSE_WEIGHTS = {
  quizzes: 30,
  attendance: 10,
  midterms: 20,
  final: 40,
} as const;

export type LetterGrade =
  | "F"
  | "D"
  | "D+"
  | "C-"
  | "C"
  | "C+"
  | "B-"
  | "B"
  | "B+"
  | "A-"
  | "A"
  | "A+"
  | "A*";

export type CourseScore = {
  quizPercentage: number;
  attendancePercentage: number;
  midtermPercentage: number;
  finalPercentage: number;
  courseworkPoints: number;
  totalPercentage: number;
  letterGrade: LetterGrade;
  gpa: number;
  passed: boolean;
};

export type CourseTranscript = CourseScore & {
  id: string;
  courseKey: string;
  courseTitle: string;
  completedAt: string;
  certificateId: string | null;
  reviewStatus: TranscriptReviewStatus;
  releaseAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type TranscriptReviewStatus = "pending" | "held" | "released";

export type PendingTranscript = Pick<
  CourseTranscript,
  "id" | "courseTitle" | "completedAt" | "reviewStatus" | "releaseAt"
>;

export const TRANSCRIPT_REVIEW_DAYS = 7;

const BANDS: Array<{ minimum: number; letter: LetterGrade; gpa: number }> = [
  { minimum: 95, letter: "A*", gpa: 4 },
  { minimum: 90, letter: "A+", gpa: 4 },
  { minimum: 85, letter: "A", gpa: 4 },
  { minimum: 80, letter: "A-", gpa: 3.7 },
  { minimum: 77, letter: "B+", gpa: 3.3 },
  { minimum: 73, letter: "B", gpa: 3 },
  { minimum: 70, letter: "B-", gpa: 2.7 },
  { minimum: 67, letter: "C+", gpa: 2.3 },
  { minimum: 63, letter: "C", gpa: 2 },
  { minimum: 60, letter: "C-", gpa: 1.7 },
  { minimum: 55, letter: "D+", gpa: 1.3 },
  { minimum: 50, letter: "D", gpa: 1 },
  { minimum: 0, letter: "F", gpa: 0 },
];

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function gradeForPercentage(percentage: number): { letter: LetterGrade; gpa: number } {
  const score = clampPercentage(percentage);
  const band = BANDS.find((candidate) => score >= candidate.minimum) ?? BANDS[BANDS.length - 1];
  return { letter: band.letter, gpa: band.gpa };
}

export function scoreCourse(input: {
  quizPercentage: number;
  attendancePercentage: number;
  midtermPercentage: number;
  finalPercentage: number;
  /** An absent final is an academic fail even when coursework alone exceeds 50%. */
  finalAbsent?: boolean;
}): CourseScore {
  const quizPercentage = clampPercentage(input.quizPercentage);
  const attendancePercentage = clampPercentage(input.attendancePercentage);
  const midtermPercentage = clampPercentage(input.midtermPercentage);
  const finalPercentage = clampPercentage(input.finalPercentage);
  const courseworkPoints = round2(
    (quizPercentage * COURSE_WEIGHTS.quizzes +
      attendancePercentage * COURSE_WEIGHTS.attendance +
      midtermPercentage * COURSE_WEIGHTS.midterms) /
      100,
  );
  const totalPercentage = round2(
    courseworkPoints + (finalPercentage * COURSE_WEIGHTS.final) / 100,
  );
  const grade = input.finalAbsent ? { letter: "F" as const, gpa: 0 } : gradeForPercentage(totalPercentage);
  return {
    quizPercentage: round2(quizPercentage),
    attendancePercentage: round2(attendancePercentage),
    midtermPercentage: round2(midtermPercentage),
    finalPercentage: round2(finalPercentage),
    courseworkPoints,
    totalPercentage,
    letterGrade: grade.letter,
    gpa: grade.gpa,
    passed: grade.letter !== "F",
  };
}

type GradeRow = {
  kind: string;
  week: number | null;
  score: string;
  max_score: string;
  flagged: boolean;
  report?: { absent?: boolean } | null;
};

function assessmentPercentage(rows: GradeRow[], expectedCount: number): number {
  if (expectedCount <= 0) return 0;
  const earnedRatios = rows.reduce((sum, row) => {
    const maximum = Number(row.max_score);
    if (row.flagged || maximum <= 0) return sum;
    return sum + Math.min(1, Math.max(0, Number(row.score) / maximum));
  }, 0);
  return round2((Math.min(expectedCount, earnedRatios) / expectedCount) * 100);
}

/** The generated course contract schedules exactly one midterm per semester. */
export function expectedMidtermCount(semesterCount: number | null | undefined): number {
  return typeof semesterCount === "number" && Number.isInteger(semesterCount) && semesterCount > 0
    ? semesterCount
    : 1;
}

function transcriptId(registrationNumber: string, courseKey: string): string {
  return `tr_${createHash("sha256").update(`${registrationNumber}:${courseKey}`).digest("hex").slice(0, 24)}`;
}

function cleanCourseTitle(title: string | null, filename: string | null, fallback: string): string {
  const source = title?.trim() || filename?.trim() || fallback.replace(/^Final:\s*/i, "").trim();
  return source.replace(/\.pdf$/i, "").replace(/_/g, " ") || "Completed course";
}

/**
 * Repair grades written by the old callback bug. The final status table binds
 * the exam id to the same learner and a service-confirmed graded final, so this
 * cannot promote an unrelated quiz or another learner's result.
 */
async function repairMisclassifiedFinalGrade(registrationNumber: string): Promise<Date | null> {
  try {
    const repaired = await query<{ taken_at: Date }>(
      `WITH repaired AS (
         UPDATE grades AS grade
            SET kind = 'final', week = NULL, max_score = 100
           FROM final_exam_status AS final_status
          WHERE grade.student_id = $1
            AND final_status.student_id = grade.student_id
            AND final_status.exam_id = grade.exam_id
            AND final_status.state = 'graded'
            AND grade.kind <> 'final'
        RETURNING grade.exam_id, grade.taken_at
       ), repaired_status AS (
         UPDATE final_exam_status AS final_status
            SET result = jsonb_set(
              final_status.result,
              '{max_score}',
              to_jsonb(100::integer),
              true
            )
           FROM repaired
          WHERE final_status.student_id = $1
            AND final_status.exam_id = repaired.exam_id
            AND final_status.result IS NOT NULL
        RETURNING final_status.exam_id
       )
       SELECT taken_at FROM repaired`,
      [registrationNumber],
    );
    return repaired[0]?.taken_at ?? null;
  } catch (error) {
    // Older databases may not have received a final callback yet, so the
    // additive final-status table may not exist. There is then nothing to fix.
    if ((error as { code?: string })?.code === "42P01") return null;
    throw error;
  }
}

/** Recover an old final even when the learner already has other transcripts. */
export async function recoverMisclassifiedFinalTranscript(
  registrationNumber: string,
): Promise<CourseTranscript | null> {
  const completedAt = await repairMisclassifiedFinalGrade(registrationNumber);
  return completedAt
    ? upsertCourseTranscript(registrationNumber, completedAt)
    : null;
}

/** Build or refresh the stable transcript snapshot after a clean final result. */
export async function upsertCourseTranscript(
  registrationNumber: string,
  completedAt: Date,
  fallbackTitle = "Completed course",
): Promise<CourseTranscript | null> {
  await repairMisclassifiedFinalGrade(registrationNumber);

  const finalGrade = await queryOne<GradeRow>(
    `SELECT kind, week, score, max_score, flagged, report
       FROM grades
      WHERE student_id = $1 AND kind = 'final' AND flagged = false
      ORDER BY taken_at DESC, id DESC LIMIT 1`,
    [registrationNumber],
  );
  if (!finalGrade || Number(finalGrade.max_score) <= 0) return null;

  const [book, lectureCountRow, attendanceRow, grades, semesterPlan, remedies] = await Promise.all([
    queryOne<{ id: number; title: string | null; filename: string }>(
      `SELECT id, title, filename FROM books
        WHERE student_id = $1 ORDER BY uploaded_at DESC, id DESC LIMIT 1`,
      [registrationNumber],
    ),
    queryOne<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM lectures WHERE student_id = $1",
      [registrationNumber],
    ),
    queryOne<{ percentage: string }>(
      `SELECT COALESCE(AVG(
                CASE
                  WHEN a.completed_at IS NOT NULL THEN 100.0
                  WHEN a.total_sentences > 0 THEN
                    100.0 * LEAST(a.last_sentence_index, a.total_sentences)
                      / a.total_sentences
                  ELSE 0.0
                END
              ), 0)::text AS percentage
         FROM lectures l
         LEFT JOIN attendance a
           ON a.lecture_id = l.id AND a.student_id = l.student_id
        WHERE l.student_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM absence_case_items AS remedy
             WHERE remedy.student_id = l.student_id
               AND remedy.item_type = 'lecture'
               AND remedy.week = l.week
               AND remedy.remedy = 'exclude_from_denominator'
          )`,
      [registrationNumber],
    ),
    query<GradeRow>(
      `SELECT kind, week, score, max_score, flagged FROM grades
        WHERE student_id = $1 AND kind IN ('quiz', 'midterm')`,
      [registrationNumber],
    ),
    readGeneratedSemesterPlan(registrationNumber),
    query<{ item_type: "lecture" | "quiz"; week: number }>(
      `SELECT DISTINCT item_type, week FROM absence_case_items
        WHERE student_id = $1 AND remedy = 'exclude_from_denominator'`,
      [registrationNumber],
    ),
  ]);

  const lectureCount = Number(lectureCountRow?.total ?? 0);
  const excusedLectureWeeks = new Set(
    remedies.filter((item) => item.item_type === "lecture").map((item) => item.week),
  );
  const excusedQuizWeeks = new Set(
    remedies.filter((item) => item.item_type === "quiz").map((item) => item.week),
  );
  const gradedAttendanceCount = Math.max(0, lectureCount - excusedLectureWeeks.size);
  const expectedQuizCount = Math.max(0, lectureCount - excusedQuizWeeks.size);
  const attendancePercentage = gradedAttendanceCount === 0 && lectureCount > 0
    ? 100
    : Number(attendanceRow?.percentage ?? 0);
  const quizGrades = grades.filter(
    (grade) => grade.kind === "quiz" && (grade.week === null || !excusedQuizWeeks.has(grade.week)),
  );
  const expectedMidterms = expectedMidtermCount(semesterPlan?.semesterCount);
  const score = scoreCourse({
    quizPercentage: expectedQuizCount === 0 && lectureCount > 0
      ? 100
      : assessmentPercentage(quizGrades, expectedQuizCount),
    attendancePercentage: lectureCount > 0 ? attendancePercentage : 0,
    midtermPercentage: assessmentPercentage(
      grades.filter((grade) => grade.kind === "midterm"),
      expectedMidterms,
    ),
    finalPercentage: (Number(finalGrade.score) / Number(finalGrade.max_score)) * 100,
    finalAbsent: finalGrade.report?.absent === true,
  });

  const courseKey = book ? `book:${book.id}` : `final:${fallbackTitle}`;
  const id = transcriptId(registrationNumber, courseKey);
  const courseTitle = cleanCourseTitle(book?.title ?? null, book?.filename ?? null, fallbackTitle);
  const releaseAt = new Date(completedAt.getTime() + TRANSCRIPT_REVIEW_DAYS * DAY_MS);
  await query(
    `INSERT INTO course_transcripts
      (id, student_id, course_key, course_title, quiz_percentage,
       attendance_percentage, midterm_percentage, final_percentage,
       coursework_points, total_percentage, letter_grade, gpa, passed, completed_at,
       release_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (student_id, course_key) DO UPDATE SET
       course_title = EXCLUDED.course_title,
       quiz_percentage = EXCLUDED.quiz_percentage,
       attendance_percentage = EXCLUDED.attendance_percentage,
       midterm_percentage = EXCLUDED.midterm_percentage,
       final_percentage = EXCLUDED.final_percentage,
       coursework_points = EXCLUDED.coursework_points,
       total_percentage = EXCLUDED.total_percentage,
       letter_grade = EXCLUDED.letter_grade,
       gpa = EXCLUDED.gpa,
       passed = EXCLUDED.passed,
       completed_at = LEAST(course_transcripts.completed_at, EXCLUDED.completed_at),
       release_at = LEAST(course_transcripts.release_at, EXCLUDED.release_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      registrationNumber,
      courseKey,
      courseTitle,
      score.quizPercentage,
      score.attendancePercentage,
      score.midtermPercentage,
      score.finalPercentage,
      score.courseworkPoints,
      score.totalPercentage,
      score.letterGrade,
      score.gpa,
      score.passed,
      completedAt,
      releaseAt,
    ],
  );
  return getTranscript(registrationNumber, id);
}

type TranscriptRow = {
  id: string;
  course_key: string;
  course_title: string;
  quiz_percentage: string;
  attendance_percentage: string;
  midterm_percentage: string;
  final_percentage: string;
  coursework_points: string;
  total_percentage: string;
  letter_grade: LetterGrade;
  gpa: string;
  passed: boolean;
  completed_at: Date;
  certificate_id: string | null;
  review_status: TranscriptReviewStatus;
  release_at: Date;
  reviewed_at: Date | null;
  review_note: string | null;
};

function mapTranscript(row: TranscriptRow): CourseTranscript {
  return {
    id: row.id,
    courseKey: row.course_key,
    courseTitle: row.course_title,
    quizPercentage: Number(row.quiz_percentage),
    attendancePercentage: Number(row.attendance_percentage),
    midtermPercentage: Number(row.midterm_percentage),
    finalPercentage: Number(row.final_percentage),
    courseworkPoints: Number(row.coursework_points),
    totalPercentage: Number(row.total_percentage),
    letterGrade: row.letter_grade,
    gpa: Number(row.gpa),
    passed: row.passed,
    completedAt: row.completed_at.toISOString(),
    certificateId: row.certificate_id,
    reviewStatus: row.review_status,
    releaseAt: row.release_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewNote: row.review_note,
  };
}

const TRANSCRIPT_SELECT = `
  SELECT t.id, t.course_key, t.course_title, t.quiz_percentage,
         t.attendance_percentage, t.midterm_percentage, t.final_percentage,
         t.coursework_points, t.total_percentage, t.letter_grade, t.gpa,
         t.passed, t.completed_at, t.review_status, t.release_at,
         t.reviewed_at, t.review_note, c.id AS certificate_id
    FROM course_transcripts t
    LEFT JOIN certificate_artifacts c ON c.transcript_id = t.id`;

export async function getTranscript(registrationNumber: string, id: string): Promise<CourseTranscript | null> {
  const row = await queryOne<TranscriptRow>(
    `${TRANSCRIPT_SELECT} WHERE t.student_id = $1 AND t.id = $2`,
    [registrationNumber, id],
  );
  return row ? mapTranscript(row) : null;
}

export async function getTranscripts(registrationNumber: string): Promise<CourseTranscript[]> {
  const rows = await query<TranscriptRow>(
    `${TRANSCRIPT_SELECT} WHERE t.student_id = $1 ORDER BY t.completed_at DESC`,
    [registrationNumber],
  );
  return rows.map(mapTranscript);
}

export async function getTranscriptPage(
  registrationNumber: string,
  page: number,
  pageSize: number,
): Promise<{
  transcripts: CourseTranscript[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}> {
  const count = await queryOne<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM course_transcripts WHERE student_id = $1",
    [registrationNumber],
  );
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), pages);
  const rows = await query<TranscriptRow>(
    `${TRANSCRIPT_SELECT} WHERE t.student_id = $1
      ORDER BY t.completed_at DESC, t.id DESC LIMIT $2 OFFSET $3`,
    [registrationNumber, pageSize, (normalizedPage - 1) * pageSize],
  );
  return {
    transcripts: rows.map(mapTranscript),
    pagination: { page: normalizedPage, pageSize, total, pages },
  };
}

/** Release untouched review windows using the academic clock, not wall time. */
export async function releaseDueTranscripts(
  referenceTime: Date,
  registrationNumber?: string,
): Promise<number> {
  const result = await query<{ id: string }>(
    `UPDATE course_transcripts
        SET review_status = 'released', updated_at = CURRENT_TIMESTAMP
      WHERE review_status = 'pending'
        AND release_at <= $1
        AND ($2::text IS NULL OR student_id = $2)
      RETURNING id`,
    [referenceTime, registrationNumber ?? null],
  );
  return result.length;
}

export async function getStudentTranscriptAccess(
  registrationNumber: string,
  referenceTime: Date,
): Promise<{ transcripts: CourseTranscript[]; pending: PendingTranscript[] }> {
  await releaseDueTranscripts(referenceTime, registrationNumber);
  const all = await getTranscripts(registrationNumber);
  return {
    transcripts: all.filter((transcript) => transcript.reviewStatus === "released"),
    pending: all
      .filter((transcript) => transcript.reviewStatus !== "released")
      .map(({ id, courseTitle, completedAt, reviewStatus, releaseAt }) => ({
        id,
        courseTitle,
        completedAt,
        reviewStatus,
        releaseAt,
      })),
  };
}

export type TranscriptReviewAction = "hold" | "release";

export async function reviewTranscript(input: {
  actorId: string;
  actorEmail: string;
  registrationNumber: string;
  transcriptId: string;
  action: TranscriptReviewAction;
  note?: string;
  reviewedAt: Date;
}): Promise<CourseTranscript | null> {
  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new Error("Review note must be 500 characters or fewer.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; review_status: TranscriptReviewStatus }>(
      `SELECT id, review_status FROM course_transcripts
        WHERE id = $1 AND student_id = $2
        FOR UPDATE`,
      [input.transcriptId, input.registrationNumber],
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    if (input.action === "hold" && found.rows[0].review_status === "released") {
      throw new Error("A released transcript cannot be hidden again.");
    }
    await client.query(
      `UPDATE course_transcripts
          SET review_status = $3,
              release_at = CASE WHEN $3 = 'released' THEN LEAST(release_at, $4) ELSE release_at END,
              reviewed_at = $4,
              reviewed_by = $5::uuid,
              review_note = $6,
              notification_queued_at = CASE
                WHEN $3 = 'released' THEN NULL
                ELSE notification_queued_at
              END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND student_id = $2`,
      [
        input.transcriptId,
        input.registrationNumber,
        input.action === "release" ? "released" : "held",
        input.reviewedAt,
        input.actorId,
        note,
      ],
    );
    await client.query(
      `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       VALUES ('transcript.review', $1, $2, $3, $4::jsonb)`,
      [
        input.actorId,
        input.actorEmail,
        input.transcriptId,
        JSON.stringify({
          registrationNumber: input.registrationNumber,
          decision: input.action,
          note,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getTranscript(input.registrationNumber, input.transcriptId);
}
