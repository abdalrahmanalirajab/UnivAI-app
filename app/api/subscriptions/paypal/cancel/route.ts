import {
  cancelPayPalSubscription,
  PayPalConfigurationError,
  PayPalRequestError,
} from "@/lib/paypal";
import { requireUserApi } from "@/lib/session";
import {
  cancelLocalSubscription,
  getSubscriptionSnapshot,
} from "@/lib/subscriptions";
import { enqueueEmailNotification } from "@/lib/notification-outbox";

export async function POST() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const current = await getSubscriptionSnapshot(gate.id);
  if (current.provider !== "paypal" || !current.providerSubscriptionId) {
    return Response.json({ error: "You do not have a PayPal subscription." }, { status: 409 });
  }

  try {
    await cancelPayPalSubscription(current.providerSubscriptionId);
    await cancelLocalSubscription({
      userId: gate.id,
      subscriptionId: current.providerSubscriptionId,
    });
    await enqueueEmailNotification({
      userId: gate.id,
      eventId: `paypal:${current.providerSubscriptionId}:cancelled`,
      event: {
        type: "billing.subscription_cancelled",
        planName: current.planName,
      },
    }).catch(() => {
      console.error("[notifications] could not queue subscription cancellation email");
    });
    return Response.json({ subscription: await getSubscriptionSnapshot(gate.id) });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof PayPalRequestError) {
      return Response.json({ error: error.message }, { status: error.status >= 500 ? 502 : 400 });
    }
    console.error("[subscriptions] PayPal cancellation failed", error);
    return Response.json({ error: "Could not cancel the PayPal subscription." }, { status: 502 });
  }
}
