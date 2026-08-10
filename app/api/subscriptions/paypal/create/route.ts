import {
  createPayPalSubscription,
  getPayPalSubscription,
  PayPalConfigurationError,
  PayPalRequestError,
  payPalPlanId,
} from "@/lib/paypal";
import { requireUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import {
  isSubscriptionPlanCode,
  type SubscriptionPlanCode,
} from "@/lib/subscription-plans";
import {
  getSubscriptionSnapshot,
  markPayPalSubscriptionPending,
} from "@/lib/subscriptions";

type PaidPlan = Exclude<SubscriptionPlanCode, "free">;

function isPaidPlan(value: unknown): value is PaidPlan {
  return isSubscriptionPlanCode(value) && value !== "free";
}

function paymentError(error: unknown): Response {
  if (error instanceof PayPalConfigurationError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof PayPalRequestError) {
    return Response.json({ error: error.message }, { status: error.status >= 500 ? 502 : 400 });
  }
  console.error("[subscriptions] PayPal checkout failed", error);
  return Response.json({ error: "Could not start PayPal checkout." }, { status: 502 });
}

export async function POST(request: Request) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { planCode?: unknown } | null;
  if (!isPaidPlan(body?.planCode)) {
    return Response.json({ error: "Choose the Supporter or Patron plan." }, { status: 400 });
  }

  try {
    const current = await getSubscriptionSnapshot(gate.id);
    if (current.planCode !== "free" && current.status === "active") {
      return Response.json(
        { error: "Cancel your current paid plan before choosing another one." },
        { status: 409 },
      );
    }
    if (current.status === "approval_pending" && current.providerSubscriptionId) {
      const pending = await getPayPalSubscription(current.providerSubscriptionId);
      const approvalUrl = pending.links?.find((link) => link.rel === "approve")?.href;
      if (approvalUrl && pending.plan_id === payPalPlanId(body.planCode)) {
        return Response.json({ approvalUrl, subscriptionId: pending.id });
      }
    }

    const created = await createPayPalSubscription({
      userId: gate.id,
      planCode: body.planCode,
    });
    await markPayPalSubscriptionPending({
      userId: gate.id,
      planCode: body.planCode,
      subscriptionId: created.subscription.id,
      providerPlanId: created.subscription.plan_id,
    });
    return Response.json({
      approvalUrl: created.approvalUrl,
      subscriptionId: created.subscription.id,
    });
  } catch (error) {
    return paymentError(error);
  }
}
