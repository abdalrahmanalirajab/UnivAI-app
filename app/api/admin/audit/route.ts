import { query } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Recent privileged-action audit entries. Admin+ only. */
export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const rows = await query(
    `SELECT id, action, actor_id, actor_email, target_id, detail, created_at
       FROM auth_audit
      ORDER BY created_at DESC
      LIMIT 100`
  );
  return Response.json({ audit: rows });
}
