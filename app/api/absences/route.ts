import { NextRequest } from "next/server";
import {
  AbsenceCaseError,
  getEligibleAbsenceItems,
  getLearnerAbsenceCasePage,
  submitAbsenceCase,
  type AbsenceItemType,
} from "@/lib/absence-cases";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";
import { CreditError } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "10");
  if (!Number.isInteger(page) || page < 1 || page > 100_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return Response.json({ error: "Invalid pagination." }, { status: 400 });
  }
  const [casePage, eligibleItems] = await Promise.all([
    getLearnerAbsenceCasePage(gate.registrationNumber, page, pageSize),
    getEligibleAbsenceItems(gate.registrationNumber),
  ]);
  return Response.json(
    { cases: casePage.cases, pagination: casePage.pagination, eligibleItems },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "generation");
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    reason?: unknown;
    items?: Array<{ itemType?: unknown; week?: unknown }>;
    idempotencyKey?: unknown;
  } | null;
  if (
    !body ||
    typeof body.reason !== "string" ||
    !Array.isArray(body.items) ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 8 ||
    body.idempotencyKey.length > 160
  ) {
    return Response.json({ error: "A reason, one missed item, and request id are required." }, { status: 400 });
  }
  try {
    const absenceCase = await submitAbsenceCase(
      gate,
      body.reason,
      body.items.map((item) => ({
        itemType: item.itemType as AbsenceItemType,
        week: item.week as number,
      })),
      body.idempotencyKey,
    );
    return Response.json({ case: absenceCase }, { status: 201 });
  } catch (error) {
    if (error instanceof AbsenceCaseError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof CreditError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Could not submit absence case", error);
    return Response.json({ error: "Could not submit the absence case." }, { status: 500 });
  }
}
