/**
 * Assessment paper size. Lecture length is derived by UnivAI-Agent from each
 * week's source pages; this setting only chooses how many questions the Exam
 * system serves from the generated bank.
 */

export type CourseSize = "XS" | "S" | "M" | "L" | "XL";

export const COURSE_SIZES: Record<
  CourseSize,
  { quizPaper: number; midPaper: number; blurb: string }
> = {
  XS: { quizPaper: 5, midPaper: 10, blurb: "5-question quiz" },
  S: { quizPaper: 6, midPaper: 12, blurb: "6-question quiz" },
  M: { quizPaper: 10, midPaper: 20, blurb: "10-question quiz" },
  L: { quizPaper: 12, midPaper: 24, blurb: "12-question quiz" },
  XL: { quizPaper: 15, midPaper: 30, blurb: "15-question quiz" },
};

export const DEFAULT_SIZE: CourseSize = "XS";

export function isCourseSize(value: unknown): value is CourseSize {
  return typeof value === "string" && value in COURSE_SIZES;
}
