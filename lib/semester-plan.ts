import { promises as fs } from "node:fs";
import path from "node:path";
import { LECTURES_ROOT } from "./paths";

export const SEMESTER_PLAN_SCHEMA = "univai.semester.week-plan";
export const MAX_SEMESTER_WEEKS = 12;
export const MAX_COURSE_SEMESTERS = 10;
export const MAX_COURSE_WEEKS = MAX_SEMESTER_WEEKS * MAX_COURSE_SEMESTERS;

export type GeneratedSemester = {
  semester: number;
  weekCount: number;
};

export type GeneratedSemesterPlan = {
  chapterCount: number | null;
  semesterCount: number;
  weekCount: number;
  semesters: GeneratedSemester[];
};

export class GeneratedSemesterPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedSemesterPlanError";
  }
}

/** Validate the cross-repository course contract written by UnivAI-Agent. */
export function parseGeneratedSemesterPlan(value: unknown): GeneratedSemesterPlan {
  if (!value || typeof value !== "object") {
    throw new GeneratedSemesterPlanError("The generated semester plan is not an object.");
  }
  const plan = value as {
    schema_name?: unknown;
    chapter_count?: unknown;
    semester_count?: unknown;
    week_count?: unknown;
    weeks?: unknown;
    semesters?: unknown;
  };
  if (plan.schema_name !== SEMESTER_PLAN_SCHEMA) {
    throw new GeneratedSemesterPlanError("The generated semester plan has an unknown schema.");
  }
  if (
    typeof plan.week_count !== "number" ||
    !Number.isInteger(plan.week_count) ||
    plan.week_count < 1 ||
    plan.week_count > MAX_COURSE_WEEKS
  ) {
    throw new GeneratedSemesterPlanError(
      `The generated course plan must contain 1-${MAX_COURSE_WEEKS} total weeks.`,
    );
  }
  if (!Array.isArray(plan.weeks) || plan.weeks.length !== plan.week_count) {
    throw new GeneratedSemesterPlanError(
      "The generated semester plan's week_count does not match its weeks.",
    );
  }
  const contiguous = plan.weeks.every((week, index) => {
    return Boolean(week && typeof week === "object" && (week as { week?: unknown }).week === index + 1);
  });
  if (!contiguous) {
    throw new GeneratedSemesterPlanError(
      "The generated semester plan's weeks must be contiguous and start at 1.",
    );
  }
  // v1 generated plans represented one semester and did not carry semester
  // summaries. Keep them readable while all new plans use the explicit v2
  // course structure below.
  if (plan.semesters === undefined && plan.semester_count === undefined) {
    if (plan.week_count > MAX_SEMESTER_WEEKS) {
      throw new GeneratedSemesterPlanError(
        `A legacy generated semester cannot exceed ${MAX_SEMESTER_WEEKS} weeks.`,
      );
    }
    return {
      chapterCount: null,
      semesterCount: 1,
      weekCount: plan.week_count,
      semesters: [{ semester: 1, weekCount: plan.week_count }],
    };
  }

  if (
    !Number.isInteger(plan.semester_count) ||
    (plan.semester_count as number) < 1 ||
    (plan.semester_count as number) > MAX_COURSE_SEMESTERS ||
    !Array.isArray(plan.semesters) ||
    plan.semesters.length !== plan.semester_count
  ) {
    throw new GeneratedSemesterPlanError("The generated course has invalid semesters.");
  }
  if (
    typeof plan.chapter_count !== "number" ||
    !Number.isInteger(plan.chapter_count) ||
    plan.chapter_count < 1
  ) {
    throw new GeneratedSemesterPlanError("The generated course has an invalid chapter count.");
  }

  let globalWeek = 1;
  const semesters: GeneratedSemester[] = plan.semesters.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new GeneratedSemesterPlanError("The generated course has an invalid semester record.");
    }
    const semester = candidate as {
      semester?: unknown;
      week_count?: unknown;
      starts_at_week?: unknown;
      ends_at_week?: unknown;
      quiz_count?: unknown;
      midterms?: unknown;
      final_after_week?: unknown;
    };
    const number = index + 1;
    if (
      semester.semester !== number ||
      typeof semester.week_count !== "number" ||
      !Number.isInteger(semester.week_count) ||
      semester.week_count < 1 ||
      semester.week_count > MAX_SEMESTER_WEEKS ||
      semester.starts_at_week !== globalWeek ||
      semester.ends_at_week !== globalWeek + semester.week_count - 1 ||
      semester.quiz_count !== semester.week_count ||
      semester.final_after_week !== semester.week_count
    ) {
      throw new GeneratedSemesterPlanError("The generated course has inconsistent semester timing.");
    }
    const expectedMidterms = Array.from(
      { length: Math.floor(semester.week_count / 4) },
      (_, midtermIndex) => (midtermIndex + 1) * 4,
    );
    if (
      !Array.isArray(semester.midterms) ||
      semester.midterms.length !== expectedMidterms.length ||
      !semester.midterms.every((midterm, midtermIndex) =>
        Boolean(
          midterm &&
          typeof midterm === "object" &&
          (midterm as { number?: unknown }).number === midtermIndex + 1 &&
          (midterm as { after_week?: unknown }).after_week === expectedMidterms[midtermIndex],
        ),
      )
    ) {
      throw new GeneratedSemesterPlanError("The generated course has an invalid monthly midterm cadence.");
    }
    const semesterWeeks = (plan.weeks as unknown[]).slice(
      globalWeek - 1,
      globalWeek - 1 + semester.week_count,
    );
    if (
      !semesterWeeks.every((week, weekIndex) =>
        Boolean(
          week &&
          typeof week === "object" &&
          (week as { semester?: unknown }).semester === number &&
          (week as { semester_week?: unknown }).semester_week === weekIndex + 1,
        ),
      )
    ) {
      throw new GeneratedSemesterPlanError("The generated course has invalid semester-local weeks.");
    }
    globalWeek += semester.week_count;
    return { semester: number, weekCount: semester.week_count };
  });
  if (globalWeek - 1 !== plan.week_count) {
    throw new GeneratedSemesterPlanError("The generated semesters do not cover every course week.");
  }
  return {
    chapterCount: plan.chapter_count,
    semesterCount: plan.semester_count as number,
    weekCount: plan.week_count,
    semesters,
  };
}

export function parseSemesterPlanWeekCount(value: unknown): number {
  return parseGeneratedSemesterPlan(value).weekCount;
}

/** `null` means generation has not written its authoritative plan yet. */
export async function readGeneratedSemesterPlan(
  sid: string,
  lecturesRoot: string = LECTURES_ROOT,
): Promise<GeneratedSemesterPlan | null> {
  const planPath = path.join(lecturesRoot, sid, "semester-plan.json");
  try {
    const raw = await fs.readFile(planPath, "utf8");
    return parseGeneratedSemesterPlan(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    if (error instanceof GeneratedSemesterPlanError) throw error;
    throw new GeneratedSemesterPlanError(
      `The generated semester plan cannot be read: ${(error as Error).message}`,
    );
  }
}

export async function readGeneratedSemesterWeekCount(
  sid: string,
  lecturesRoot: string = LECTURES_ROOT,
): Promise<number | null> {
  return (await readGeneratedSemesterPlan(sid, lecturesRoot))?.weekCount ?? null;
}
