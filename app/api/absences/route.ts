import { NextRequest } from "next/server";
import {
  AbsenceCaseError,
  getEligibleAbsenceItems,
  getLearnerAbsenceCases,
  submitAbsenceCase,
  type AbsenceItemType,
} from "@/lib/absence-cases";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const [cases, eligibleItems] = await Promise.all([
    getLearnerAbsenceCases(gate.registrationNumber),
    getEligibleAbsenceItems(gate.registrationNumber),
  ]);
  return Response.json({ cases, eligibleItems }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "generation");
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    reason?: unknown;
    items?: Array<{ itemType?: unknown; week?: unknown }>;
  } | null;
  if (!body || typeof body.reason !== "string" || !Array.isArray(body.items)) {
    return Response.json({ error: "A reason and at least one missed item are required." }, { status: 400 });
  }
  try {
    const absenceCase = await submitAbsenceCase(
      gate,
      body.reason,
      body.items.map((item) => ({
        itemType: item.itemType as AbsenceItemType,
        week: item.week as number,
      })),
    );
    return Response.json({ case: absenceCase }, { status: 201 });
  } catch (error) {
    if (error instanceof AbsenceCaseError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Could not submit absence case", error);
    return Response.json({ error: "Could not submit the absence case." }, { status: 500 });
  }
}
