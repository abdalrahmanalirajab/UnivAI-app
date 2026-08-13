import { requireUser } from "@/lib/session";
import PayPalReturn from "./PayPalReturn";

export default async function PayPalReturnPage({
  searchParams,
}: {
  searchParams: Promise<{
    subscription_id?: string;
    subscriptionId?: string;
    ba_token?: string;
    token?: string;
    demo_order?: string;
  }>;
}) {
  await requireUser("/subscribe/paypal/return");
  const query = await searchParams;
  const demoOrder = query.demo_order === "1";
  const checkoutId = demoOrder
    ? query.token ?? null
    : query.subscription_id ?? query.subscriptionId ?? query.ba_token ?? null;
  return <PayPalReturn checkoutId={checkoutId} demoOrder={demoOrder} />;
}
