import { CreditError } from "@/lib/credits";
import { loadAuthorizedLectureBundle } from "@/lib/demo-media-server";
import { answerDemoLectureQuestion, DemoQuestionError } from "@/lib/demo-lecture-qa";
import { requireDemoLectureAccess } from "@/lib/demo-lecture-progress";
import { getLectures } from "@/lib/lectures";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";
import { requireSameOrigin } from "@/lib/same-origin";
import { ensureDemoVoice } from "@/lib/demo-voice";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "live");
  if (limited) return limited;
  const { id } = await params;
  try {
    await requireDemoLectureAccess(gate.registrationNumber, id);
    const bundle = await loadAuthorizedLectureBundle(gate.registrationNumber, id);
    if (!bundle) return Response.json({ error: "No such lecture." }, { status: 404 });
    if (!bundle.row.joined_at || bundle.row.completed_at) return Response.json({ error: "Start the active lecture before asking a question." }, { status: 409 });
    const lectures = await getLectures(gate.registrationNumber);
    const previousWeekAvailable = lectures.some((lecture) => lecture.week === bundle.row.week - 1 && lecture.completed);
    const result = await answerDemoLectureQuestion({
      userId: gate.id,
      sid: gate.registrationNumber,
      bundle,
      body: await request.json().catch(() => null),
      previousWeekAvailable,
      signal: request.signal,
    });
    if (result.kind === "answer") {
      let answerAudioUrl: string | null = null;
      try {
        await ensureDemoVoice(result.turn.answer, request.signal);
        answerAudioUrl = `/api/lecture/${id}/demo-voice/answer-${result.turn.id}`;
      } catch (error) {
        console.error("[demo-media] answer voice failed", { error: error instanceof Error ? error.name : "UnknownError" });
      }
      return Response.json({
        ...result,
        answerAudioUrl,
      });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof DemoQuestionError || error instanceof CreditError) {
      return Response.json({ error: error.message, code: error instanceof DemoQuestionError ? error.code : error.code }, { status: error instanceof DemoQuestionError ? error.status : error.status });
    }
    console.error("[demo-media] question failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "The question could not be answered. No Credits were charged." }, { status: 502 });
  }
}
