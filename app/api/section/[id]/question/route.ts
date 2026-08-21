import { loadAuthorizedSectionBundle } from "@/lib/demo-media-server";
import { answerDemoSectionQuestion, DemoSectionQuestionError } from "@/lib/demo-section-qa";
import { CreditError } from "@/lib/credits";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";
import { requireSameOrigin } from "@/lib/same-origin";

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
    const bundle = await loadAuthorizedSectionBundle(gate.registrationNumber, id);
    if (!bundle || !bundle.section.sectionOpen) return Response.json({ error: "No open section was found." }, { status: 404 });
    return Response.json(await answerDemoSectionQuestion({ userId: gate.id, sid: gate.registrationNumber, bundle, body: await request.json().catch(() => null), signal: request.signal }));
  } catch (error) {
    if (error instanceof DemoSectionQuestionError || error instanceof CreditError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[demo-media] section question failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "The section question could not be answered. No Credits were charged." }, { status: 502 });
  }
}
