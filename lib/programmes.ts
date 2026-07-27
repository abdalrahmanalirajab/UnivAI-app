import { query, queryOne } from "./db";
import type { ProgrammePlanV1, Course } from "@/test/fixtures/programme-plan-v1";

export type ProgrammeStatus = "proposed" | "approved";

export type Programme = {
  id: number;
  student_id: string;
  collection_id: number;
  name: string;
  status: ProgrammeStatus;
  plan_version: number;
  plan: ProgrammePlanV1;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgrammeResult =
  | { ok: true; programme: Programme }
  | { ok: false; error: string; current: Programme };

const COLUMNS =
  "id, student_id, collection_id, name, status, plan_version, plan, approved_at, created_at, updated_at";

function toProgramme(row: Record<string, unknown>): Programme {
  return row as unknown as Programme;
}

export async function getProgramme(
  programmeId: number,
  studentId: string,
): Promise<Programme | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM programmes WHERE id = $1 AND student_id = $2`,
    [programmeId, studentId],
  );
  return row ? toProgramme(row) : null;
}

export async function createProgramme(
  studentId: string,
  collectionId: number,
  name: string,
  plan: ProgrammePlanV1,
): Promise<Programme> {
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO programmes (student_id, collection_id, name, plan, plan_version)
     VALUES ($1, $2, $3, $4::jsonb, 1) RETURNING ${COLUMNS}`,
    [studentId, collectionId, name, JSON.stringify(plan)],
  );
  return toProgramme(row!);
}

export async function updateProgrammePlan(
  programmeId: number,
  studentId: string,
  plan: ProgrammePlanV1,
  expectedVersion: number,
): Promise<ProgrammeResult> {
  const current = await getProgramme(programmeId, studentId);
  if (!current) {
    return { ok: false, error: "Programme not found.", current: null as unknown as Programme };
  }
  if (current.plan_version !== expectedVersion) {
    return { ok: false, error: "Stale plan version. Refresh and try again.", current };
  }
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE programmes
     SET plan = $1::jsonb, plan_version = plan_version + 1, updated_at = NOW()
     WHERE id = $2 AND student_id = $3 AND plan_version = $4
     RETURNING ${COLUMNS}`,
    [JSON.stringify(plan), programmeId, studentId, expectedVersion],
  );
  if (!row) {
    const refreshed = await getProgramme(programmeId, studentId);
    return { ok: false, error: "Stale plan version. Refresh and try again.", current: refreshed! };
  }
  return { ok: true, programme: toProgramme(row) };
}

export async function approveProgramme(
  programmeId: number,
  studentId: string,
  planVersion: number,
): Promise<ProgrammeResult> {
  const current = await getProgramme(programmeId, studentId);
  if (!current) {
    return { ok: false, error: "Programme not found.", current: null as unknown as Programme };
  }
  if (current.status === "approved") {
    return { ok: false, error: "Programme is already approved.", current };
  }
  if (current.plan_version !== planVersion) {
    return { ok: false, error: "Stale plan version. Refresh and try again.", current };
  }
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE programmes
     SET status = 'approved', approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND plan_version = $3 AND status = 'proposed'
     RETURNING ${COLUMNS}`,
    [programmeId, studentId, planVersion],
  );
  if (!row) {
    const refreshed = await getProgramme(programmeId, studentId);
    return { ok: false, error: "Stale plan version. Refresh and try again.", current: refreshed! };
  }
  return { ok: true, programme: toProgramme(row) };
}

/** ── Plan-edit helpers (pure transformations) ── */

export function renameCourse(plan: ProgrammePlanV1, courseId: string, newTitle: string): ProgrammePlanV1 {
  return {
    ...plan,
    courses: plan.courses.map((c) => (c.id === courseId ? { ...c, title: newTitle } : c)),
  };
}

export function reorderCourses(
  plan: ProgrammePlanV1,
  semesterId: string,
  courseIds: string[],
): ProgrammePlanV1 {
  return {
    ...plan,
    semesters: plan.semesters.map((s) =>
      s.id === semesterId ? { ...s, course_ids: courseIds } : s,
    ),
  };
}

export function mergeCourses(
  plan: ProgrammePlanV1,
  targetCourseIds: string[],
  intoTitle: string,
): ProgrammePlanV1 {
  const merged = plan.courses.filter((c) => targetCourseIds.includes(c.id));
  if (merged.length === 0) return plan;
  const newId = `merged_${targetCourseIds.join("_")}`;
  const newCourse: Course = {
    id: newId,
    title: intoTitle,
    credits: merged.reduce((s, c) => s + c.credits, 0),
    lecture_hours: merged.reduce((s, c) => s + c.lecture_hours, 0),
    tutorial_hours: merged.reduce((s, c) => s + c.tutorial_hours, 0),
    lab_hours: merged.reduce((s, c) => s + c.lab_hours, 0),
    description: merged.map((c) => c.title).join("; "),
  };
  const keep = plan.courses.filter((c) => !targetCourseIds.includes(c.id));
  const dedup = (ids: string[]): string[] =>
    ids
      .map((id) => (targetCourseIds.includes(id) ? newId : id))
      .filter((id, i, a) => a.indexOf(id) === i);
  return {
    ...plan,
    courses: [...keep, newCourse],
    semesters: plan.semesters.map((s) => ({ ...s, course_ids: dedup(s.course_ids) })),
    prerequisites: plan.prerequisites
      .filter((p) => !targetCourseIds.includes(p.course_id))
      .map((p) => ({ ...p, requires: dedup(p.requires) })),
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: dedup(sc.course_ids),
    })),
  };
}

export function splitCourse(
  plan: ProgrammePlanV1,
  courseId: string,
  parts: { title: string; credits: number }[],
): ProgrammePlanV1 {
  const original = plan.courses.find((c) => c.id === courseId);
  if (!original || parts.length === 0) return plan;
  const newCourses: Course[] = parts.map((part, i) => ({
    id: `${courseId}_part_${i}`,
    title: part.title,
    credits: part.credits,
    lecture_hours: Math.round(original.lecture_hours / parts.length),
    tutorial_hours: Math.round(original.tutorial_hours / parts.length),
    lab_hours: Math.round(original.lab_hours / parts.length),
    description: original.description,
  }));
  const newIds = newCourses.map((c) => c.id);
  const replaceId = (id: string) => (id === courseId ? newIds : [id]);
  return {
    ...plan,
    courses: [...plan.courses.filter((c) => c.id !== courseId), ...newCourses],
    semesters: plan.semesters.map((s) => ({
      ...s,
      course_ids: s.course_ids.flatMap(replaceId),
    })),
    prerequisites: [
      ...plan.prerequisites.filter((p) => p.course_id !== courseId),
      ...plan.prerequisites
        .filter((p) => p.requires.includes(courseId))
        .map((p) => ({ ...p, requires: [...p.requires.filter((r) => r !== courseId), ...newIds] })),
    ],
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: sc.course_ids.flatMap(replaceId),
    })),
  };
}

export function excludeCourse(plan: ProgrammePlanV1, courseId: string): ProgrammePlanV1 {
  return {
    ...plan,
    courses: plan.courses.filter((c) => c.id !== courseId),
    semesters: plan.semesters.map((s) => ({
      ...s,
      course_ids: s.course_ids.filter((id) => id !== courseId),
    })),
    prerequisites: plan.prerequisites.filter((p) => p.course_id !== courseId),
    source_coverage: plan.source_coverage.map((sc) => ({
      ...sc,
      course_ids: sc.course_ids.filter((id) => id !== courseId),
    })),
  };
}
