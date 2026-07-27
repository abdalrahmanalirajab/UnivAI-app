import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { getProgramme, updateProgrammePlan } from "@/lib/programmes";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";

export const dynamic = "force-dynamic";

function parseProgrammeId(params: { programmeId: string }): number | null {
  const id = Number(params.programmeId);
  return Number.isFinite(id) ? id : null;
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

export async function PUT(
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

  let body: { plan?: unknown; planVersion?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { plan, planVersion } = body;
  if (!plan || typeof planVersion !== "number" || !Number.isInteger(planVersion) || planVersion < 1) {
    return Response.json(
      { error: "plan (object) and planVersion (positive integer) are required." },
      { status: 400 },
    );
  }

  const result = await updateProgrammePlan(
    programmeId,
    gate.studentId,
    plan as ProgrammePlanV1,
    planVersion,
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
