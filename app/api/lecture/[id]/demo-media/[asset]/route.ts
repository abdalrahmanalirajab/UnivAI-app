import { requireLearningActionApi } from "@/lib/session";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { lectureAsset, loadAuthorizedLectureBundle, serveDemoMediaFile } from "@/lib/demo-media-server";
import { DemoLectureSessionError, requireDemoLectureAccess } from "@/lib/demo-lecture-progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id, asset } = await params;
  try {
    await requireDemoLectureAccess(gate.registrationNumber, id);
    const bundle = await loadAuthorizedLectureBundle(gate.registrationNumber, id);
    if (!bundle) return new Response(null, { status: 404 });
    const target = lectureAsset(bundle, asset);
    return target ? serveDemoMediaFile(request, target) : new Response(null, { status: 404 });
  } catch (error) {
    if (error instanceof DemoLectureSessionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return Response.json({ error: "The lecturer's audio is unavailable. Please retry." }, { status: 409 });
  }
}

export const GET = handle;
export const HEAD = handle;
