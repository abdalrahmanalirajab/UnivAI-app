import {
  GET as serveDemoMediaAsset,
  HEAD as inspectDemoMediaAsset,
} from "../../demo-media/[asset]/route";

export const dynamic = "force-dynamic";

// Compatibility for a lecture tab opened before the route was renamed from
// demo_media to demo-media. Keeping the alias prevents stale tabs from
// receiving a misleading 404 even though their prepared media exists.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; asset: string }> },
) {
  return serveDemoMediaAsset(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; asset: string }> },
) {
  return inspectDemoMediaAsset(request, context);
}
