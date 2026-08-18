import { NextRequest } from "next/server";
import { getAdminActionPage } from "@/lib/absence-cases";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

function pageValue(value: string | null, fallback: number, maximum: number) {
  const number = value === null ? fallback : Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum ? number : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const page = pageValue(request.nextUrl.searchParams.get("page"), 1, 100_000);
  const pageSize = pageValue(request.nextUrl.searchParams.get("pageSize"), 10, 50);
  if (!page || !pageSize) return Response.json({ error: "Invalid pagination." }, { status: 400 });
  return Response.json(
    await getAdminActionPage(page, pageSize),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
