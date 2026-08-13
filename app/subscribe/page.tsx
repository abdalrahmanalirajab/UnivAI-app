import { requireVerifiedUser } from "@/lib/session";
import SubscriptionWorkspace from "./SubscriptionWorkspace";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  await requireVerifiedUser("/subscribe");
  const query = await searchParams;
  return <SubscriptionWorkspace checkoutCancelled={query.cancelled === "1"} />;
}
