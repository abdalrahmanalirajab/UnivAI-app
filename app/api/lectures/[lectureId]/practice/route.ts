import { NextRequest } from "next/server";
import { CreditError } from "@/lib/credits";
import {
  generatePracticeAssessment,
  PracticeAssessmentError,
  resumeLatestPracticeAssessment,
} from "@/lib/practice-assessments";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown): Response {
  if (error instanceof CreditError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof PracticeAssessmentError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[practice] request failed", error);
  return Response.json({ error: "The practice quiz could not be prepared." }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ lectureId: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "generation");
  if (limited) return limited;
  const { lectureId } = await context.params;
  const body = await request.json().catch(() => null) as { idempotencyKey?: unknown } | null;
  if (
    !UUID.test(lectureId) ||
    typeof body?.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 8 ||
    body.idempotencyKey.length > 160
  ) {
    return Response.json({ error: "Invalid practice request." }, { status: 400 });
  }
  try {
    const launch = await generatePracticeAssessment({
      userId: gate.id,
      registrationNumber: gate.registrationNumber,
      studentName: gate.name,
      lectureId,
      idempotencyKey: body.idempotencyKey,
    });
    return Response.json(launch, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ lectureId: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "assessment");
  if (limited) return limited;
  const { lectureId } = await context.params;
  if (!UUID.test(lectureId)) {
    return Response.json({ error: "Invalid lecture." }, { status: 400 });
  }
  try {
    const launch = await resumeLatestPracticeAssessment({
      userId: gate.id,
      registrationNumber: gate.registrationNumber,
      studentName: gate.name,
      lectureId,
    });
    return Response.json(launch);
  } catch (error) {
    return failure(error);
  }
}
