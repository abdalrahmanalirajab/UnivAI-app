import {
  getPayPalSubscription,
  PayPalConfigurationError,
  PayPalRequestError,
  planCodeForPayPalPlan,
} from "@/lib/paypal";
import { requireUserApi } from "@/lib/session";
import {
  getSubscriptionSnapshot,
  reconcilePayPalSubscription,
} from "@/lib/subscriptions";
import { enqueueEmailNotification } from "@/lib/notification-outbox";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export async function POST(request: Request) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as {
    subscriptionId?: unknown;
  } | null;
  if (typeof body?.subscriptionId !== "string") {
    return Response.json({ error: "Missing PayPal subscription." }, { status: 400 });
  }

  try {
    const providerSubscription = await getPayPalSubscription(body.subscriptionId);
    const planCode = planCodeForPayPalPlan(providerSubscription.plan_id);
    if (providerSubscription.custom_id !== gate.id || !planCode) {
      return Response.json({ error: "This PayPal subscription does not belong to you." }, { status: 403 });
    }
    const current = await getSubscriptionSnapshot(gate.id);
    if (
      current.providerSubscriptionId &&
      current.providerSubscriptionId !== providerSubscription.id
    ) {
      return Response.json({ error: "This is not your pending PayPal checkout." }, { status: 409 });
    }

    await reconcilePayPalSubscription({
      userId: gate.id,
      planCode,
      subscriptionId: providerSubscription.id,
      providerPlanId: providerSubscription.plan_id,
      providerStatus: providerSubscription.status,
    });
    const subscription = await getSubscriptionSnapshot(gate.id);
    const active = subscription.status === "active" && subscription.planCode === planCode;
    if (active) {
      await enqueueEmailNotification({
        userId: gate.id,
        eventId: `paypal:${providerSubscription.id}:activated`,
        event: {
          type: "billing.subscription_activated",
          planName: subscription.planName,
        },
      }).catch(() => {
        console.error("[notifications] could not queue subscription activation email");
      });
    }
    return Response.json(
      { active, subscription },
      { status: active ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof PayPalRequestError) {
      return Response.json({ error: error.message }, { status: error.status >= 500 ? 502 : 400 });
    }
    console.error("[subscriptions] PayPal confirmation failed", error);
    return Response.json({ error: "Could not verify the PayPal subscription." }, { status: 502 });
  }
}
