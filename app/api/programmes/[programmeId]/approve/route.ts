import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { approveProgramme } from "@/lib/programmes";

export const dynamic = "force-dynamic";

function parseProgrammeId(params: { programmeId: string }): number | null {
  const id = Number(params.programmeId);
  return Number.isFinite(id) ? id : null;
}

export async function POST(
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

  let body: { planVersion?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { planVersion } = body;
  if (typeof planVersion !== "number" || !Number.isInteger(planVersion) || planVersion < 1) {
    return Response.json(
      { error: "planVersion must be a positive integer." },
      { status: 400 },
    );
  }

  const result = await approveProgramme(programmeId, gate.studentId, planVersion);

  if (!result.ok) {
    const status =
      result.error === "Programme not found." ? 404
      : result.error === "Programme is already approved." ? 409
      : 409;
    return Response.json(
      { error: result.error, current: result.current },
      { status },
    );
  }

  return Response.json({ programme: result.programme });
}
