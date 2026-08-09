import { createHash } from "node:crypto";

import { query, queryOne } from "./db";

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
};

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
  const grade = gradeForPercentage(totalPercentage);
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

function transcriptId(registrationNumber: string, courseKey: string): string {
  return `tr_${createHash("sha256").update(`${registrationNumber}:${courseKey}`).digest("hex").slice(0, 24)}`;
}

function cleanCourseTitle(title: string | null, filename: string | null, fallback: string): string {
  const source = title?.trim() || filename?.trim() || fallback.replace(/^Final:\s*/i, "").trim();
  return source.replace(/\.pdf$/i, "").replace(/_/g, " ") || "Completed course";
}

/** Build or refresh the stable transcript snapshot after a clean final result. */
export async function upsertCourseTranscript(
  registrationNumber: string,
  completedAt: Date,
  fallbackTitle = "Completed course",
): Promise<CourseTranscript | null> {
  const finalGrade = await queryOne<GradeRow>(
    `SELECT kind, week, score, max_score, flagged
       FROM grades
      WHERE student_id = $1 AND kind = 'final' AND flagged = false
      ORDER BY taken_at DESC, id DESC LIMIT 1`,
    [registrationNumber],
  );
  if (!finalGrade || Number(finalGrade.max_score) <= 0) return null;

  const [book, lectureCountRow, attendanceRow, grades] = await Promise.all([
    queryOne<{ id: number; title: string | null; filename: string }>(
      `SELECT id, title, filename FROM books
        WHERE student_id = $1 ORDER BY uploaded_at DESC, id DESC LIMIT 1`,
      [registrationNumber],
    ),
    queryOne<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM lectures WHERE student_id = $1",
      [registrationNumber],
    ),
    queryOne<{ attended: string }>(
      `SELECT COUNT(*)::text AS attended
         FROM attendance a
         JOIN lectures l ON l.id = a.lecture_id
        WHERE a.student_id = $1 AND l.student_id = $1 AND a.joined_at IS NOT NULL`,
      [registrationNumber],
    ),
    query<GradeRow>(
      `SELECT kind, week, score, max_score, flagged FROM grades
        WHERE student_id = $1 AND kind IN ('quiz', 'midterm')`,
      [registrationNumber],
    ),
  ]);

  const lectureCount = Number(lectureCountRow?.total ?? 0);
  const attended = Number(attendanceRow?.attended ?? 0);
  const expectedMidterms = Math.max(1, Math.floor(lectureCount / 4));
  const score = scoreCourse({
    quizPercentage: assessmentPercentage(
      grades.filter((grade) => grade.kind === "quiz"),
      lectureCount,
    ),
    attendancePercentage: lectureCount > 0 ? (attended / lectureCount) * 100 : 0,
    midtermPercentage: assessmentPercentage(
      grades.filter((grade) => grade.kind === "midterm"),
      expectedMidterms,
    ),
    finalPercentage: (Number(finalGrade.score) / Number(finalGrade.max_score)) * 100,
  });

  const courseKey = book ? `book:${book.id}` : `final:${fallbackTitle}`;
  const id = transcriptId(registrationNumber, courseKey);
  const courseTitle = cleanCourseTitle(book?.title ?? null, book?.filename ?? null, fallbackTitle);
  await query(
    `INSERT INTO course_transcripts
      (id, student_id, course_key, course_title, quiz_percentage,
       attendance_percentage, midterm_percentage, final_percentage,
       coursework_points, total_percentage, letter_grade, gpa, passed, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
       completed_at = EXCLUDED.completed_at,
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
  };
}

const TRANSCRIPT_SELECT = `
  SELECT t.id, t.course_key, t.course_title, t.quiz_percentage,
         t.attendance_percentage, t.midterm_percentage, t.final_percentage,
         t.coursework_points, t.total_percentage, t.letter_grade, t.gpa,
         t.passed, t.completed_at, c.id AS certificate_id
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
