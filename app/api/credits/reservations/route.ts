import { NextRequest } from "next/server";
import {
  CreditError,
  releaseCreditReservation,
  reserveCredits,
} from "@/lib/credits";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function creditError(error: unknown): Response {
  if (error instanceof CreditError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[credits] reservation request failed", error);
  return Response.json(
    { error: "Could not reserve Credits for this action.", code: "CREDIT_SERVICE_ERROR" },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "live");
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    purpose?: unknown;
    lectureId?: unknown;
    idempotencyKey?: unknown;
  } | null;
  if (
    body?.purpose !== "raise_hand" ||
    typeof body.lectureId !== "string" ||
    !UUID.test(body.lectureId) ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 8 ||
    body.idempotencyKey.length > 160
  ) {
    return Response.json({ error: "Invalid Credit reservation request." }, { status: 400 });
  }
  try {
    const reservation = await reserveCredits({
      userId: gate.id,
      purpose: "raise_hand",
      idempotencyKey: `raise-hand:${gate.id}:${body.idempotencyKey}`,
      referenceType: "lecture",
      referenceId: body.lectureId,
      ttlSeconds: 15 * 60,
    });
    return Response.json({ reservation }, { status: reservation.status === "reserved" ? 201 : 200 });
  } catch (error) {
    return creditError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const body = await request.json().catch(() => null) as { reservationId?: unknown } | null;
  if (typeof body?.reservationId !== "string" || !UUID.test(body.reservationId)) {
    return Response.json({ error: "Invalid Credit reservation." }, { status: 400 });
  }
  try {
    const reservation = await releaseCreditReservation(gate.id, body.reservationId);
    return Response.json({ reservation });
  } catch (error) {
    return creditError(error);
  }
}
