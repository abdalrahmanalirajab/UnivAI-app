import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";
import { getLectures } from "@/lib/lectures";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { loadAuthorizedLectureBundle } from "@/lib/demo-media-server";
import {
  applyDemoLectureAction,
  checkpointFromBundle,
  DemoLectureSessionError,
  requireDemoLectureAccess,
} from "@/lib/demo-lecture-progress";
import { requireSameOrigin } from "@/lib/same-origin";
import { getDemoLectureHistory } from "@/lib/demo-lecture-qa";
import { ANSWER_RESUME_PROMPT, demoAskPrompt, ensureDemoVoice } from "@/lib/demo-voice";

export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  if (error instanceof DemoLectureSessionError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "The lecture is unavailable.";
  const missing = message.includes("has not been prepared");
  console.error("[demo-media] lecture request failed", { error: error instanceof Error ? error.name : "UnknownError" });
  return Response.json(
    { error: missing ? "The lecturer is still preparing the classroom. Please try again shortly." : "The lecture room could not be verified. Please retry.", code: missing ? "MEDIA_NOT_PREPARED" : "MEDIA_INVALID" },
    { status: missing ? 409 : 503 },
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id } = await params;
  try {
    await requireDemoLectureAccess(gate.registrationNumber, id);
    const bundle = await loadAuthorizedLectureBundle(gate.registrationNumber, id);
    if (!bundle) return Response.json({ error: "No such lecture." }, { status: 404 });
    const [schedule, history] = await Promise.all([
      getLectures(gate.registrationNumber),
      getDemoLectureHistory(gate.registrationNumber, bundle.row.internal_id),
    ]);
    await ensureDemoVoice(demoAskPrompt(gate.name)).catch(() => undefined);
    await ensureDemoVoice(ANSWER_RESUME_PROMPT).catch(() => undefined);
    const previous = schedule.find((lecture) => lecture.week === bundle.row.week - 1 && lecture.completed);
    return Response.json({
      lecture: { id: bundle.row.public_id, week: bundle.row.week, title: bundle.row.title },
      locale: gate.uiLocale,
      scriptDigest: bundle.manifest.scriptDigest,
      manifestUrl: `/api/lecture/${id}/demo-media/manifest`,
      captionsUrl: `/api/lecture/${id}/demo-media/vtt`,
      audioUrl: `/api/lecture/${id}/demo-media/audio`,
      welcomeBackUrl: `/api/lecture/${id}/demo-media/welcome`,
      firstJoinUrl: `/api/lecture/${id}/demo-media/first-join`,
      askPromptUrl: `/api/lecture/${id}/demo-voice/ask`,
      answerResumeUrl: `/api/lecture/${id}/demo-voice/answer-resume`,
      checkpoint: checkpointFromBundle(bundle),
      history,
      previousLecture: previous ? { id: previous.id, week: previous.week, title: previous.title } : null,
    });
  } catch (error) {
    return failure(error);
  }
}

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
    const bundle = await loadAuthorizedLectureBundle(gate.registrationNumber, id);
    if (!bundle) return Response.json({ error: "No such lecture." }, { status: 404 });
    const checkpoint = await applyDemoLectureAction(gate.registrationNumber, bundle, await request.json().catch(() => null));
    return Response.json({ checkpoint });
  } catch (error) {
    return failure(error);
  }
}
