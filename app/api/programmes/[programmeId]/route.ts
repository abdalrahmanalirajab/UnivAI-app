import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/session";
import { getProgramme } from "@/lib/programmes";

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
