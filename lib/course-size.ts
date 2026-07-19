/**
 * The course size dial. One setting scales the lecture (slides, spoken length)
 * and the assessments (quiz/mid paper sizes). The Python generator holds the
 * SAME table (UnivAI-Agent/generation/lecture_gen.py SIZES) — keep them in sync.
 *
 * XS is the fast demo profile the project started with; M is a normal lecture.
 */

export type CourseSize = "XS" | "S" | "M" | "L" | "XL";

export const COURSE_SIZES: Record<
  CourseSize,
  { slides: number; quizPaper: number; midPaper: number; blurb: string }
> = {
  XS: { slides: 3, quizPaper: 5, midPaper: 10, blurb: "3 slides · ~3 min · 5-question quiz" },
  S: { slides: 5, quizPaper: 6, midPaper: 12, blurb: "5 slides · ~5 min · 6-question quiz" },
  M: { slides: 8, quizPaper: 10, midPaper: 20, blurb: "8 slides · ~8 min · 10-question quiz — the normal lecture" },
  L: { slides: 12, quizPaper: 12, midPaper: 24, blurb: "12 slides · ~12 min · 12-question quiz" },
  XL: { slides: 16, quizPaper: 15, midPaper: 30, blurb: "16 slides · ~18 min · 15-question quiz" },
};

export const DEFAULT_SIZE: CourseSize = "XS";

export function isCourseSize(value: unknown): value is CourseSize {
  return typeof value === "string" && value in COURSE_SIZES;
}
