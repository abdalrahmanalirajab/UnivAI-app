import {
  getPayPalSubscription,
  planCodeForPayPalPlan,
  verifyPayPalWebhook,
} from "@/lib/paypal";
import { recordAndReconcilePayPalEvent } from "@/lib/subscriptions";
import { enqueueEmailNotification } from "@/lib/notification-outbox";
import { getSubscriptionPlan } from "@/lib/subscription-plans";

type PayPalWebhookEvent = {
  id?: unknown;
  event_type?: unknown;
  resource?: {
    id?: unknown;
    billing_agreement_id?: unknown;
    create_time?: unknown;
  };
};

const SUBSCRIPTION_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
]);

function subscriptionId(event: PayPalWebhookEvent): string | null {
  const direct = event.resource?.id;
  const agreement = event.resource?.billing_agreement_id;
  const value = typeof agreement === "string" ? agreement : direct;
  return typeof value === "string" && /^[A-Z0-9-]{3,64}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid webhook body." }, { status: 400 });
  }
  if (typeof event.id !== "string" || typeof event.event_type !== "string") {
    return Response.json({ error: "Invalid webhook event." }, { status: 400 });
  }

  try {
    if (!(await verifyPayPalWebhook({ headers: request.headers, event }))) {
      return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
    }
    if (!SUBSCRIPTION_EVENTS.has(event.event_type)) {
      return Response.json({ accepted: true, ignored: true });
    }
    const id = subscriptionId(event);
    if (!id) return Response.json({ accepted: true, ignored: true });

    const providerSubscription = await getPayPalSubscription(id);
    const planCode = planCodeForPayPalPlan(providerSubscription.plan_id);
    if (!providerSubscription.custom_id || !planCode) {
      return Response.json({ accepted: true, ignored: true });
    }
    const result = await recordAndReconcilePayPalEvent({
      eventId: event.id,
      eventType: event.event_type,
      paymentId:
        event.event_type === "PAYMENT.SALE.COMPLETED" &&
        typeof event.resource?.id === "string"
          ? event.resource.id
          : undefined,
      paidAt:
        typeof event.resource?.create_time === "string"
          ? event.resource.create_time
          : undefined,
      subscription: {
        id: providerSubscription.id,
        customId: providerSubscription.custom_id,
        planCode,
        providerPlanId: providerSubscription.plan_id,
        status: providerSubscription.status,
        providerStartedAt: providerSubscription.start_time,
        providerPeriodEndsAt: providerSubscription.billing_info?.next_billing_time,
      },
    });
    const planName = getSubscriptionPlan(planCode).name;
    const notification =
      event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED"
        ? {
            eventId: `paypal:${providerSubscription.id}:activated`,
            event: { type: "billing.subscription_activated" as const, planName },
          }
        : event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED"
          ? {
              eventId: `paypal:${event.id}:payment-failed`,
              event: { type: "billing.payment_failed" as const, planName },
            }
          : event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED"
            ? {
                eventId: `paypal:${providerSubscription.id}:suspended`,
                event: { type: "billing.subscription_suspended" as const, planName },
              }
            : event.event_type === "BILLING.SUBSCRIPTION.CANCELLED" ||
                event.event_type === "BILLING.SUBSCRIPTION.EXPIRED"
              ? {
                  eventId: `paypal:${providerSubscription.id}:cancelled`,
                  event: { type: "billing.subscription_cancelled" as const, planName },
                }
              : null;
    if (notification) {
      await enqueueEmailNotification({
        userId: providerSubscription.custom_id,
        ...notification,
      });
    }
    return Response.json({ accepted: true, result });
  } catch (error) {
    console.error("[subscriptions] PayPal webhook failed", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
