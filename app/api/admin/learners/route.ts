import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

function boundedInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const requestedPage = boundedInteger(request.nextUrl.searchParams.get("page"), 1, 10_000);
  const pageSize = boundedInteger(request.nextUrl.searchParams.get("pageSize"), 25, 50);
  const rawSearch = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const values: unknown[] = [];
  let where = `WHERE "registrationNumber" IS NOT NULL`;
  if (rawSearch) {
    values.push(`%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`);
    where += ` AND (
      name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\'
      OR "registrationNumber" ILIKE $1 ESCAPE '\\'
    )`;
  }

  const count = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::integer AS total FROM "user" ${where}`,
    values,
  );
  const total = count?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  values.push(pageSize, (page - 1) * pageSize);
  const limitParam = values.length - 1;
  const offsetParam = values.length;
  const learners = await query<{ sid: string; name: string; email: string; role: string }>(
    `SELECT "registrationNumber" AS sid, name, email, COALESCE(role, 'student') AS role
       FROM "user"
       ${where}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values,
  );

  return Response.json({
    learners,
    pagination: {
      page,
      pageSize,
      total,
      pages,
    },
  });
}
