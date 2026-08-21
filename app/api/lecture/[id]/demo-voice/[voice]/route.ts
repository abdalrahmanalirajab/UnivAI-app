import { queryOne } from "@/lib/db";
import { ANSWER_RESUME_PROMPT, demoAskPrompt, demoVoiceTarget } from "@/lib/demo-voice";
import { loadAuthorizedLectureBundle, serveDemoMediaFile } from "@/lib/demo-media-server";
import { requireDemoLectureAccess } from "@/lib/demo-lecture-progress";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(
  request: Request,
  { params }: { params: Promise<{ id: string; voice: string }> },
) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id, voice } = await params;
  try {
    await requireDemoLectureAccess(gate.registrationNumber, id);
    const bundle = await loadAuthorizedLectureBundle(gate.registrationNumber, id);
    if (!bundle) return new Response(null, { status: 404 });
    let text: string | null = null;
    if (voice === "ask") text = demoAskPrompt(gate.name);
    else if (voice === "answer-resume") text = ANSWER_RESUME_PROMPT;
    else {
      const match = /^answer-([1-9][0-9]*)$/.exec(voice);
      if (!match) return new Response(null, { status: 404 });
      const row = await queryOne<{ answer: string }>(
        `SELECT q.answer
           FROM qa_log AS q
           JOIN lectures AS l ON l.id = q.lecture_id AND l.student_id = q.student_id
          WHERE q.id = $1 AND q.student_id = $2 AND l.public_id = $3::uuid`,
        [Number(match[1]), gate.registrationNumber, id],
      );
      text = row?.answer ?? null;
    }
    if (!text) return new Response(null, { status: 404 });
    return serveDemoMediaFile(request, await demoVoiceTarget(text, request.signal));
  } catch (error) {
    console.error("[demo-media] Piper voice failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "The lecturer's voice is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = handle;
export const HEAD = handle;
