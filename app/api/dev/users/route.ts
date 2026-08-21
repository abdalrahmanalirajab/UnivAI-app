import { searchDeveloperUsers } from "@/lib/developer-users";
import { requireDeveloperApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireDeveloperApi();
  if (gate instanceof Response) return gate;
  const search = new URL(request.url).searchParams.get("search") ?? "";
  const users = await searchDeveloperUsers(search);
  return Response.json(
    { users },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
