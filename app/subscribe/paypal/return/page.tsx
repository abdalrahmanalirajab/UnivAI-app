import { requireUser } from "@/lib/session";
import PayPalReturn from "./PayPalReturn";

export default async function PayPalReturnPage({
  searchParams,
}: {
  searchParams: Promise<{
    subscription_id?: string;
    subscriptionId?: string;
    ba_token?: string;
  }>;
}) {
  await requireUser("/subscribe/paypal/return");
  const query = await searchParams;
  const subscriptionId =
    query.subscription_id ?? query.subscriptionId ?? query.ba_token ?? null;
  return <PayPalReturn subscriptionId={subscriptionId} />;
}
