import { NextRequest } from "next/server";

import { now } from "@/lib/clock";
import {
  declineFinalExamRetake,
  listPendingFinalExamRetakes,
} from "@/lib/final-exam-retakes";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

function registrationNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sid = value.trim();
  return /^S-\d{4}-\d{6}$/.test(sid) ? sid : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const supplied = request.nextUrl.searchParams.get("sid");
  const sid = supplied ? registrationNumber(supplied) : null;
  if (supplied && !sid) return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  return Response.json(
    { requests: await listPendingFinalExamRetakes(sid ?? undefined) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const raw = await request.text();
  if (raw.length > 2048) return Response.json({ error: "The decision is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const studentId = registrationNumber(body.studentId);
  const curriculumId = typeof body.curriculumId === "string" ? body.curriculumId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!studentId) return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  if (!/^[0-9a-fA-F]{24}$/.test(curriculumId)) {
    return Response.json({ error: "Choose a valid final-exam request." }, { status: 400 });
  }

  try {
    const decision = await declineFinalExamRetake({
      studentId,
      curriculumId,
      actorId: gate.id,
      actorEmail: gate.email,
      reason,
      declinedAt: await now(),
    });
    return Response.json({
      finalCase: decision.view,
      gradeFinalized: decision.outcome?.finalized ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not decline the retake.";
    const status = /10 to 500|No retake|already|started/i.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
