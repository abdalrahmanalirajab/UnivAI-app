import { NextRequest } from "next/server";

import { now } from "@/lib/clock";
import { ensureExamWorld, getFinalExamAvailability } from "@/lib/exams";
import {
  ensureFinalExamCase,
  requestFinalExamRetake,
} from "@/lib/final-exam-retakes";
import { enqueueStudentEmailNotification } from "@/lib/notification-outbox";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "assessment");
  if (limited) return limited;

  const raw = await request.text();
  if (raw.length > 2048) return Response.json({ error: "The request is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  try {
    const [window, requestedAt] = await Promise.all([
      getFinalExamAvailability(gate.registrationNumber),
      now(),
    ]);
    const link = await ensureExamWorld(gate.registrationNumber, gate.name);
    await ensureFinalExamCase({
      studentId: gate.registrationNumber,
      curriculumId: link.curriculum_id,
      window,
    });
    const finalCase = await requestFinalExamRetake({
      studentId: gate.registrationNumber,
      curriculumId: link.curriculum_id,
      reason,
      requestedAt,
    });
    await enqueueStudentEmailNotification({
      registrationNumber: gate.registrationNumber,
      eventId: `final-retake:${link.curriculum_id}:${finalCase.retakeRequestedAt}`,
      event: {
        type: "final.retake_scheduled",
        availableAt: finalCase.retakeAvailableAt!,
      },
    });
    return Response.json({
      finalCase,
      message:
        "A retake will be available in 7 days. Use the time to review, study hard, and keep going—you’ve got this. An administrator may decline the request before it starts if the reason does not qualify.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not request the retake.";
    const status = /20 to 1000|14-day|already|already set|not scheduled/i.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
