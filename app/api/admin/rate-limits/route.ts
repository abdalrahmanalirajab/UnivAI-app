import { NextRequest } from "next/server";

import {
  getAdminRateLimitPolicies,
  parseAdminRateLimitPolicy,
  parseRateLimitScope,
  resetAdminRateLimit,
  saveAdminRateLimitPolicy,
} from "@/lib/rate-limits";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

function registrationNumberFrom(request: NextRequest): string {
  return request.nextUrl.searchParams.get("sid")?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const registrationNumber = registrationNumberFrom(request);
  if (!registrationNumber) {
    return Response.json({ error: "Choose a learner." }, { status: 400 });
  }
  const result = await getAdminRateLimitPolicies(registrationNumber);
  if (!result) return Response.json({ error: "Learner not found." }, { status: 404 });
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const raw = await request.text();
  if (raw.length > 8192) return Response.json({ error: "Policy is too large." }, { status: 413 });
  let policy: ReturnType<typeof parseAdminRateLimitPolicy>;
  try {
    policy = parseAdminRateLimitPolicy(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof SyntaxError ? "Send valid JSON." : (error as Error).message;
    return Response.json({ error: message }, { status: 400 });
  }
  try {
    const saved = await saveAdminRateLimitPolicy({
      actorId: gate.id,
      actorEmail: gate.email,
      ...policy,
    });
    if (!saved) return Response.json({ error: "Learner not found." }, { status: 404 });
    return Response.json(await getAdminRateLimitPolicies(policy.registrationNumber));
  } catch (error) {
    console.error("Rate-limit policy update failed:", error);
    return Response.json({ error: "Could not save the rate limit." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  let registrationNumber: string;
  let scope: ReturnType<typeof parseRateLimitScope>;
  try {
    registrationNumber = typeof body?.registrationNumber === "string"
      ? body.registrationNumber.trim()
      : "";
    if (!/^S-\d{4}-\d{6}$/.test(registrationNumber)) throw new Error("Choose a valid learner.");
    scope = parseRateLimitScope(body?.scope);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  try {
    const reset = await resetAdminRateLimit({
      actorId: gate.id,
      actorEmail: gate.email,
      registrationNumber,
      scope,
      restoreDefault: body?.action === "restore-default",
    });
    if (!reset) return Response.json({ error: "Learner not found." }, { status: 404 });
    return Response.json(await getAdminRateLimitPolicies(registrationNumber));
  } catch (error) {
    console.error("Rate-limit reset failed:", error);
    return Response.json({ error: "Could not reset the rate limit." }, { status: 500 });
  }
}
