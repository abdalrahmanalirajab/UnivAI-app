import { getAdminActions } from "@/lib/absence-cases";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  return Response.json(
    { actions: await getAdminActions() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
