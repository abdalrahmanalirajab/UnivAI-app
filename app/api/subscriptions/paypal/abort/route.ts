import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireVerifiedUserApi } from "@/lib/session";
import {
  abandonPendingSubscription,
  getSubscriptionSnapshot,
} from "@/lib/subscriptions";

export async function POST() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  await abandonPendingSubscription(gate.id);
  const subscription = await getSubscriptionSnapshot(gate.id);
  return Response.json({ subscription });
}
