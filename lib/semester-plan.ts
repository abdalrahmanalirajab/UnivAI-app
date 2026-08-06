import { promises as fs } from "node:fs";
import path from "node:path";
import { LECTURES_ROOT } from "./paths";

export const SEMESTER_PLAN_SCHEMA = "univai.semester.week-plan";
export const MAX_SEMESTER_WEEKS = 12;

export class GeneratedSemesterPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedSemesterPlanError";
  }
}

/** Validate the small cross-repository contract written by UnivAI-Agent. */
export function parseSemesterPlanWeekCount(value: unknown): number {
  if (!value || typeof value !== "object") {
    throw new GeneratedSemesterPlanError("The generated semester plan is not an object.");
  }
  const plan = value as { schema_name?: unknown; week_count?: unknown; weeks?: unknown };
  if (plan.schema_name !== SEMESTER_PLAN_SCHEMA) {
    throw new GeneratedSemesterPlanError("The generated semester plan has an unknown schema.");
  }
  if (
    typeof plan.week_count !== "number" ||
    !Number.isInteger(plan.week_count) ||
    plan.week_count < 1 ||
    plan.week_count > MAX_SEMESTER_WEEKS
  ) {
    throw new GeneratedSemesterPlanError(
      `The generated semester plan must contain 1-${MAX_SEMESTER_WEEKS} weeks.`,
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
  return plan.week_count;
}

/** `null` means generation has not written its authoritative plan yet. */
export async function readGeneratedSemesterWeekCount(
  sid: string,
  lecturesRoot: string = LECTURES_ROOT,
): Promise<number | null> {
  const planPath = path.join(lecturesRoot, sid, "semester-plan.json");
  try {
    const raw = await fs.readFile(planPath, "utf8");
    return parseSemesterPlanWeekCount(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    if (error instanceof GeneratedSemesterPlanError) throw error;
    throw new GeneratedSemesterPlanError(
      `The generated semester plan cannot be read: ${(error as Error).message}`,
    );
  }
}
