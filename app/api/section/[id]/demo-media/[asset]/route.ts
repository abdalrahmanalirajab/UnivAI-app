import { loadAuthorizedSectionBundle, sectionAsset, serveDemoMediaFile } from "@/lib/demo-media-server";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  if (!isDemoMediaTransport()) return new Response(null, { status: 404 });
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id, asset } = await params;
  try {
    const bundle = await loadAuthorizedSectionBundle(gate.registrationNumber, id);
    if (!bundle || !bundle.section.sectionOpen) return new Response(null, { status: 404 });
    const target = sectionAsset(bundle, asset);
    return target ? serveDemoMediaFile(request, target) : new Response(null, { status: 404 });
  } catch {
    return Response.json({ error: "The lecturer's audio is unavailable. Please retry." }, { status: 409 });
  }
}

export const GET = handle;
export const HEAD = handle;
