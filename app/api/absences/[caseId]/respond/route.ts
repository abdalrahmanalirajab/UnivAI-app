import { NextRequest } from "next/server";
import { AbsenceCaseError, respondToAbsenceClarification } from "@/lib/absence-cases";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "generation");
  if (limited) return limited;
  const { caseId } = await params;
  if (!UUID.test(caseId)) return Response.json({ error: "Case not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { answer?: unknown } | null;
  if (!body || typeof body.answer !== "string") {
    return Response.json({ error: "A clarification answer is required." }, { status: 400 });
  }
  try {
    const absenceCase = await respondToAbsenceClarification(gate, caseId, body.answer);
    return Response.json({ case: absenceCase });
  } catch (error) {
    if (error instanceof AbsenceCaseError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Could not update absence case", error);
    return Response.json({ error: "Could not update the absence case." }, { status: 500 });
  }
}
