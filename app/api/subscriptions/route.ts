import { requireUserApi } from "@/lib/session";
import { getSubscriptionSnapshot } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const subscription = await getSubscriptionSnapshot(gate.id);
  return Response.json({ subscription });
}
