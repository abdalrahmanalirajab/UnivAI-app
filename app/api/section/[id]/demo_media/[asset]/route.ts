import {
  GET as serveDemoMediaAsset,
  HEAD as inspectDemoMediaAsset,
} from "../../demo-media/[asset]/route";

export const dynamic = "force-dynamic";

// Sections use the same compatibility path as lectures so an already-open
// demo tab remains usable across a dev-server refresh.
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
