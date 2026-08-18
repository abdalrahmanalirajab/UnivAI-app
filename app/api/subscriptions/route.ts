import { NextRequest } from "next/server";
import { requireStudentApi } from "@/lib/session";
import { getSubscriptionSnapshot } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireStudentApi();
  if (gate instanceof Response) return gate;

  const page = Number(request.nextUrl.searchParams.get("activityPage") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("activityPageSize") ?? "10");
  const subscription = await getSubscriptionSnapshot(gate.id, {
    activityPage: Number.isInteger(page) && page > 0 ? page : 1,
    activityPageSize: [10, 25, 50].includes(pageSize) ? pageSize : 10,
  });
  return Response.json({ subscription });
}
