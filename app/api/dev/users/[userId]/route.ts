import {
  DeveloperInputError,
  DeveloperNotFoundError,
  getDeveloperUserSnapshot,
  mutateDeveloperUser,
  type DeveloperMutation,
} from "@/lib/developer-users";
import { requireSameOrigin } from "@/lib/same-origin";
import { requireDeveloperApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof DeveloperNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof DeveloperInputError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "23505") return Response.json({ error: "That value is already in use." }, { status: 409 });
    if (code === "23514" || code === "23503" || code === "22P02") {
      return Response.json({ error: "The database rejected that value." }, { status: 400 });
    }
  }
  console.error("Developer dashboard request failed:", error);
  return Response.json({ error: "Developer operation failed." }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireDeveloperApi();
  if (gate instanceof Response) return gate;
  try {
    const { userId } = await context.params;
    const revealRequested = new URL(request.url).searchParams.get("revealPasswordHash") === "1";
    const revealConfirmed = request.headers.get("x-dev-confirm") === "REVEAL PASSWORD HASH";
    if (revealRequested && !revealConfirmed) {
      return Response.json({ error: "Password hash reveal requires explicit confirmation." }, { status: 400 });
    }
    const snapshot = await getDeveloperUserSnapshot(userId, revealRequested);
    return Response.json(snapshot, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireDeveloperApi();
  if (gate instanceof Response) return gate;
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (declaredSize > 16_384) return Response.json({ error: "Request is too large." }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 16_384) return Response.json({ error: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as DeveloperMutation;
    if (!body || typeof body !== "object" || typeof body.action !== "string") {
      throw new DeveloperInputError("A developer action is required.");
    }
    const { userId } = await context.params;
    await mutateDeveloperUser(gate, userId, body);
    const snapshot = await getDeveloperUserSnapshot(userId);
    return Response.json(snapshot, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
