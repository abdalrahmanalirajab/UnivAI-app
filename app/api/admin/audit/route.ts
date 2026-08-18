import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Recent privileged-action audit entries. Admin+ only. */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "25");
  if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 100_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return Response.json({ error: "Invalid pagination." }, { status: 400 });
  }
  const count = await queryOne<{ total: string }>("SELECT COUNT(*)::text AS total FROM auth_audit");
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const rows = await query(
    `SELECT id, action, actor_id, actor_email, target_id, detail, created_at
       FROM auth_audit
      ORDER BY created_at DESC, id DESC
      LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  return Response.json({ audit: rows, pagination: { page, pageSize, total, pages } });
}
