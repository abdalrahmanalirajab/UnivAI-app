import { getNotificationPreferences, parseNotificationPreferencePatch, setNotificationPreferences } from "@/lib/notification-outbox";
import { REQUIRED_NOTIFICATION_CATEGORIES } from "@/lib/notification-types";
import { requireUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

const required = Object.fromEntries(
  REQUIRED_NOTIFICATION_CATEGORIES.map((category) => [category, true]),
);

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const preferences = await getNotificationPreferences(gate.id);
  return Response.json(
    { preferences, required },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  const raw = await request.text();
  if (raw.length > 4096) {
    return Response.json({ error: "Preference update is too large." }, { status: 413 });
  }

  try {
    const body = JSON.parse(raw) as { preferences?: unknown };
    const updates = parseNotificationPreferencePatch(body?.preferences);
    const preferences = await setNotificationPreferences(gate.id, updates);
    return Response.json(
      { preferences, required },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const detail = error instanceof SyntaxError ? "Send valid JSON." : (error as Error).message;
    return Response.json({ error: detail }, { status: 400 });
  }
}
