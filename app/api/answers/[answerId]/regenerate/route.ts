import { NextRequest } from "next/server";
import {
  AnswerRegenerationError,
  regenerateRaisedHandAnswer,
} from "@/lib/answer-regeneration";
import { CreditError } from "@/lib/credits";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ answerId: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "generation");
  if (limited) return limited;
  const answerId = Number((await context.params).answerId);
  const body = await request.json().catch(() => null) as { idempotencyKey?: unknown } | null;
  if (
    !Number.isSafeInteger(answerId) ||
    answerId < 1 ||
    typeof body?.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 8 ||
    body.idempotencyKey.length > 160
  ) {
    return Response.json({ error: "Invalid answer regeneration request." }, { status: 400 });
  }
  try {
    const regenerated = await regenerateRaisedHandAnswer({
      userId: gate.id,
      registrationNumber: gate.registrationNumber,
      answerId,
      idempotencyKey: body.idempotencyKey,
    });
    return Response.json(regenerated, { status: 201 });
  } catch (error) {
    if (error instanceof CreditError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AnswerRegenerationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[answers] regeneration failed", error);
    return Response.json({ error: "Could not regenerate the answer." }, { status: 500 });
  }
}
