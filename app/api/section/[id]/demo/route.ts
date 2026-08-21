import { sectionFeedbackTarget } from "@/lib/ai-output-feedback-types";
import { loadAuthorizedSectionBundle } from "@/lib/demo-media-server";
import { applyDemoSectionAction, DemoSectionError, getDemoSectionState } from "@/lib/demo-section-session";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";
import { requireSameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

function failure(error: unknown, sectionId: string): Response {
  if (error instanceof DemoSectionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  const message = error instanceof Error ? error.message : "The section is unavailable.";
  console.error(`[demo-section:${sectionId}] ${message}`);
  const missing = message.includes("has not been prepared");
  return Response.json({ error: missing ? "The lecturer is still preparing the section. Please try again shortly." : "The section room could not be verified. Please retry.", code: missing ? "MEDIA_NOT_PREPARED" : "MEDIA_INVALID" }, { status: missing ? 409 : 503 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id } = await params;
  try {
    const bundle = await loadAuthorizedSectionBundle(gate.registrationNumber, id);
    if (!bundle) return Response.json({ error: "No such section." }, { status: 404 });
    if (!bundle.section.sectionOpen) return Response.json({ error: "This section opens at its fixed weekly time.", opensAt: bundle.section.sectionStartsAt.toISOString() }, { status: 403 });
    return Response.json({
      section: {
        id: bundle.section.id,
        week: bundle.section.week,
        title: bundle.section.payload.title,
        totalMinutes: bundle.section.payload.total_minutes,
        objectives: bundle.section.payload.objectives,
        todos: bundle.section.payload.todos,
        payloadHash: bundle.section.payloadHash,
        planVersion: bundle.section.planVersion,
        feedbackTarget: sectionFeedbackTarget(bundle.section.id, bundle.section.payloadHash),
      },
      manifestUrl: `/api/section/${id}/demo-media/manifest`,
      welcomeBackUrl: `/api/section/${id}/demo-media/welcome`,
      nodeMediaBaseUrl: `/api/section/${id}/demo-media/`,
      session: await getDemoSectionState(gate.registrationNumber, bundle),
      locale: gate.uiLocale,
    });
  } catch (error) {
    return failure(error, id);
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
    const bundle = await loadAuthorizedSectionBundle(gate.registrationNumber, id);
    if (!bundle) return Response.json({ error: "No such section." }, { status: 404 });
    if (!bundle.section.sectionOpen) return Response.json({ error: "This section opens at its fixed weekly time.", opensAt: bundle.section.sectionStartsAt.toISOString() }, { status: 403 });
    return Response.json({ session: await applyDemoSectionAction(gate.registrationNumber, bundle, await request.json().catch(() => null)) });
  } catch (error) {
    return failure(error, id);
  }
}
