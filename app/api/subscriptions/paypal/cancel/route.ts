import {
  cancelPayPalSubscription,
  isPayPalFakeSubscriptionEnabled,
  PayPalConfigurationError,
  PayPalRequestError,
} from "@/lib/paypal";
import { requireVerifiedUserApi } from "@/lib/session";
import {
  cancelLocalSubscription,
  getSubscriptionSnapshot,
} from "@/lib/subscriptions";
import { enqueueEmailNotification } from "@/lib/notification-outbox";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export async function POST() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  const current = await getSubscriptionSnapshot(gate.id);
  if (
    current.planCode === "free" ||
    (current.status !== "active" && current.status !== "suspended")
  ) {
    return Response.json({ error: "You do not have an active paid membership." }, { status: 409 });
  }
  const localDemo = current.provider === "none" && isPayPalFakeSubscriptionEnabled();
  if (!localDemo && (current.provider !== "paypal" || !current.providerSubscriptionId)) {
    return Response.json({ error: "This membership cannot be revoked here." }, { status: 409 });
  }

  try {
    if (!localDemo && current.providerSubscriptionId) {
      await cancelPayPalSubscription(current.providerSubscriptionId);
    }
    await cancelLocalSubscription({
      userId: gate.id,
      subscriptionId: localDemo ? null : current.providerSubscriptionId,
    });
    await enqueueEmailNotification({
      userId: gate.id,
      eventId: localDemo
        ? `membership:${gate.id}:${current.subscribedAt ?? current.updatedAt}:cancelled`
        : `paypal:${current.providerSubscriptionId}:cancelled`,
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
