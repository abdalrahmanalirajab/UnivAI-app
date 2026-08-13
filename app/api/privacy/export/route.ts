import { requireUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { buildPersonalDataExport } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  const payload = await buildPersonalDataExport({
    userId: gate.id,
    registrationNumber: gate.registrationNumber,
  });
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="univai-data-${gate.registrationNumber}.json"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
