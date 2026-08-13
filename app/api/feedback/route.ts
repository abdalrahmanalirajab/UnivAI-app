import { NextRequest } from "next/server";
import { requirePreparedSourceApi } from "@/lib/session";
import { getLatestLectureOutput } from "@/lib/feedback";
import {
  parseAiOutputFeedbackRequest,
  submitAiOutputFeedback,
} from "@/lib/ai-output-feedback";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const lectureId = request.nextUrl.searchParams.get("lectureId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lectureId)) {
    return Response.json({ error: "lectureId must be a UUID." }, { status: 400 });
  }
  const output = await getLatestLectureOutput(gate.registrationNumber, lectureId);
  return output
    ? Response.json({ output })
    : Response.json({ error: "No recorded output exists for this lecture yet." }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "feedback");
  if (limited) return limited;

  const body: unknown = await request.json().catch(() => null);
  const parsed = parseAiOutputFeedbackRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const result = await submitAiOutputFeedback(gate.registrationNumber, parsed.value);
  return result.ok
    ? Response.json(result.value, { status: parsed.value.action === "report" ? 201 : 200 })
    : Response.json({ error: result.error }, { status: result.status });
}
