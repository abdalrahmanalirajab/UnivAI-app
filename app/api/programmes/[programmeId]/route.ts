import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import {
  getProgramme,
  updateProgrammePlan,
  renameCourse,
  reorderCourses,
  mergeCourses,
  splitCourse,
  excludeCourse,
} from "@/lib/programmes";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";

export const dynamic = "force-dynamic";

function parseProgrammeId(params: { programmeId: string }): number | null {
  const id = Number(params.programmeId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> },
) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { programmeId: raw } = await params;
  const programmeId = parseProgrammeId({ programmeId: raw });
  if (!programmeId) {
    return Response.json({ error: "Invalid programme ID." }, { status: 400 });
  }

  const programme = await getProgramme(programmeId, gate.studentId);
  if (!programme) {
    return Response.json({ error: "Programme not found." }, { status: 404 });
  }

  return Response.json({ programme });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> },
) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { programmeId: raw } = await params;
  const programmeId = parseProgrammeId({ programmeId: raw });
  if (!programmeId) {
    return Response.json({ error: "Invalid programme ID." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { operation, expectedVersion } = body as {
    operation?: string;
    expectedVersion?: unknown;
  };

  if (
    !operation ||
    !["rename", "reorder", "merge", "split", "exclude"].includes(operation)
  ) {
    return Response.json(
      { error: "operation must be one of: rename, reorder, merge, split, exclude." },
      { status: 400 },
    );
  }

  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return Response.json(
      { error: "expectedVersion must be a positive integer." },
      { status: 400 },
    );
  }

  const programme = await getProgramme(programmeId, gate.studentId);
  if (!programme) {
    return Response.json({ error: "Programme not found." }, { status: 404 });
  }

  if (programme.status === "approved") {
    return Response.json(
      { error: "Programme is already approved." },
      { status: 409 },
    );
  }

  if (programme.plan_version !== expectedVersion) {
    return Response.json(
      { error: "Stale plan version. Refresh and try again.", current: programme },
      { status: 409 },
    );
  }

  let updatedPlan: ProgrammePlanV1;

  switch (operation) {
    case "rename": {
      const { courseId, newTitle } = body as {
        courseId?: string;
        newTitle?: string;
      };
      if (!courseId || typeof courseId !== "string" || !newTitle || typeof newTitle !== "string") {
        return Response.json(
          { error: "courseId (string) and newTitle (string) are required for rename." },
          { status: 400 },
        );
      }
      if (!programme.plan.courses.some((course) => course.id === courseId)) {
        return Response.json({ error: "Course not found." }, { status: 400 });
      }
      const title = newTitle.trim();
      if (title.length < 1 || title.length > 120) {
        return Response.json(
          { error: "newTitle must be between 1 and 120 characters." },
          { status: 400 },
        );
      }
      updatedPlan = renameCourse(programme.plan, courseId, title);
      break;
    }
    case "reorder": {
      const { semesterId, courseIds } = body as {
        semesterId?: string;
        courseIds?: unknown;
      };
      if (
        !semesterId || typeof semesterId !== "string" ||
        !Array.isArray(courseIds) || !courseIds.every((id): id is string => typeof id === "string")
      ) {
        return Response.json(
          { error: "semesterId (string) and courseIds (string[]) are required for reorder." },
          { status: 400 },
        );
      }
      const semester = programme.plan.semesters.find(
        (candidate) => candidate.id === semesterId,
      );
      const requestedIds = new Set(courseIds);
      if (
        !semester ||
        requestedIds.size !== courseIds.length ||
        semester.course_ids.length !== courseIds.length ||
        semester.course_ids.some((id) => !requestedIds.has(id))
      ) {
        return Response.json(
          { error: "courseIds must contain each course in the semester exactly once." },
          { status: 400 },
        );
      }
      updatedPlan = reorderCourses(programme.plan, semesterId, courseIds);
      break;
    }
    case "merge": {
      const { targetCourseIds, intoTitle } = body as {
        targetCourseIds?: unknown;
        intoTitle?: string;
      };
      if (
        !Array.isArray(targetCourseIds) || targetCourseIds.length < 2 ||
        !targetCourseIds.every((id): id is string => typeof id === "string") ||
        !intoTitle || typeof intoTitle !== "string"
      ) {
        return Response.json(
          { error: "targetCourseIds (string[], min 2) and intoTitle (string) are required for merge." },
          { status: 400 },
        );
      }
      const uniqueTargetIds = [...new Set(targetCourseIds)];
      const title = intoTitle.trim();
      if (
        uniqueTargetIds.length !== targetCourseIds.length ||
        title.length < 1 ||
        title.length > 120 ||
        uniqueTargetIds.some(
          (id) => !programme.plan.courses.some((course) => course.id === id),
        )
      ) {
        return Response.json(
          { error: "Merge courses must be unique, existing courses with a valid title." },
          { status: 400 },
        );
      }
      updatedPlan = mergeCourses(programme.plan, uniqueTargetIds, title);
      break;
    }
    case "split": {
      const { courseId, parts } = body as {
        courseId?: string;
        parts?: unknown;
      };
      if (
        !courseId || typeof courseId !== "string" ||
        !Array.isArray(parts) || parts.length < 2 ||
        !parts.every(
          (p): p is { title: string; credits: number } =>
            typeof p === "object" && p !== null &&
            typeof (p as { title?: string }).title === "string" &&
            typeof (p as { credits?: number }).credits === "number" &&
            Number.isFinite((p as { credits: number }).credits) &&
            (p as { credits: number }).credits > 0,
        )
      ) {
        return Response.json(
          { error: "courseId (string) and parts (array of {title, credits}, min 2) are required for split." },
          { status: 400 },
        );
      }
      const original = programme.plan.courses.find(
        (course) => course.id === courseId,
      );
      const normalizedParts = parts.map((part) => ({
        title: part.title.trim(),
        credits: part.credits,
      }));
      const splitCredits = normalizedParts.reduce(
        (total, part) => total + part.credits,
        0,
      );
      if (
        !original ||
        normalizedParts.some((part) => part.title.length < 1 || part.title.length > 120) ||
        Math.abs(splitCredits - original.credits) > Number.EPSILON
      ) {
        return Response.json(
          { error: "Split parts must have valid titles and preserve the original credits." },
          { status: 400 },
        );
      }
      updatedPlan = splitCourse(programme.plan, courseId, normalizedParts);
      break;
    }
    case "exclude": {
      const { courseId } = body as { courseId?: string };
      if (!courseId || typeof courseId !== "string") {
        return Response.json(
          { error: "courseId (string) is required for exclude." },
          { status: 400 },
        );
      }
      if (!programme.plan.courses.some((course) => course.id === courseId)) {
        return Response.json({ error: "Course not found." }, { status: 400 });
      }
      updatedPlan = excludeCourse(programme.plan, courseId);
      break;
    }
    default:
      return Response.json({ error: `Unknown operation: ${operation}.` }, { status: 400 });
  }

  const result = await updateProgrammePlan(
    programmeId,
    gate.studentId,
    updatedPlan,
    expectedVersion,
  );

  if (!result.ok) {
    const status = result.error === "Programme not found." ? 404 : 409;
    return Response.json(
      { error: result.error, current: result.current },
      { status },
    );
  }

  return Response.json({ programme: result.programme });
}
