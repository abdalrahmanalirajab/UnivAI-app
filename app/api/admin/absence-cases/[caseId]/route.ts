import { NextRequest } from "next/server";
import {
  AbsenceCaseError,
  decideAbsenceCase,
  getAdminAbsenceCase,
  type AbsenceOutcome,
} from "@/lib/absence-cases";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const { caseId } = await params;
  if (!UUID.test(caseId)) return Response.json({ error: "Case not found." }, { status: 404 });
  const absenceCase = await getAdminAbsenceCase(caseId);
  return absenceCase
    ? Response.json({ case: absenceCase }, { headers: { "Cache-Control": "private, no-store" } })
    : Response.json({ error: "Case not found." }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const { caseId } = await params;
  if (!UUID.test(caseId)) return Response.json({ error: "Case not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { outcome?: unknown; reason?: unknown } | null;
  if (!body || typeof body.outcome !== "string" || typeof body.reason !== "string") {
    return Response.json({ error: "A decision and administrator reason are required." }, { status: 400 });
  }
  try {
    await decideAbsenceCase(gate.id, caseId, body.outcome as AbsenceOutcome, body.reason);
    return Response.json({ case: await getAdminAbsenceCase(caseId) });
  } catch (error) {
    if (error instanceof AbsenceCaseError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Could not decide absence case", error);
    return Response.json({ error: "Could not save the absence decision." }, { status: 500 });
  }
}
