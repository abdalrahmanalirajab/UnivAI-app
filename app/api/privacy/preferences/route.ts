import { requireUserApi } from "@/lib/session";
import { getPrivacyPreferences, setPrivacyPreferences } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  return Response.json({ preferences: await getPrivacyPreferences(gate.id) });
}

export async function PUT(request: Request) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  if (
    values.saleOrSharingOptOut !== undefined &&
    typeof values.saleOrSharingOptOut !== "boolean"
  ) {
    return Response.json({ error: "saleOrSharingOptOut must be boolean." }, { status: 400 });
  }
  if (
    values.limitSensitiveDataUse !== undefined &&
    typeof values.limitSensitiveDataUse !== "boolean"
  ) {
    return Response.json({ error: "limitSensitiveDataUse must be boolean." }, { status: 400 });
  }
  const preferences = await setPrivacyPreferences(gate.id, {
    saleOrSharingOptOut: values.saleOrSharingOptOut as boolean | undefined,
    limitSensitiveDataUse: values.limitSensitiveDataUse as boolean | undefined,
  });
  return Response.json({ preferences });
}
