import { requireUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import {
  createPrivacyRequest,
  listPrivacyRequests,
  validatePrivacyRequest,
  type PrivacyRequestType,
} from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  return Response.json({ requests: await listPrivacyRequests(gate.id) });
}

export async function POST(request: Request) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const { requestType, detail } = body as Record<string, unknown>;
  const validation = validatePrivacyRequest(requestType, detail);
  if (validation) return Response.json({ error: validation }, { status: 400 });

  const result = await createPrivacyRequest({
    userId: gate.id,
    registrationNumber: gate.registrationNumber,
    requestType: requestType as PrivacyRequestType,
    detail: typeof detail === "string" ? detail : null,
  });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
