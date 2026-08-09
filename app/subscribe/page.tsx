import { requireUser } from "@/lib/session";
import SubscriptionWorkspace from "./SubscriptionWorkspace";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cancelled?: string }>;
}) {
  await requireUser("/subscribe");
  const query = await searchParams;
  return (
    <SubscriptionWorkspace
      requestedPlan={query.plan ?? null}
      checkoutCancelled={query.cancelled === "1"}
    />
  );
}
