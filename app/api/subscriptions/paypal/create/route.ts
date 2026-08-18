import {
  createPayPalDemoOrder,
  createPayPalSubscription,
  getPayPalSubscription,
  PayPalConfigurationError,
  PayPalRequestError,
  isPayPalFakeSubscriptionEnabled,
  payPalPlanId,
} from "@/lib/paypal";
import { requireVerifiedUserApi } from "@/lib/session";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import {
  getSubscriptionPlan,
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
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { planCode?: unknown } | null;
  if (!isPaidPlan(body?.planCode)) {
    return Response.json({ error: "Choose the Supporter or Patron plan." }, { status: 400 });
  }

  try {
    const current = await getSubscriptionSnapshot(gate.id);
    const sandboxDemo = isPayPalFakeSubscriptionEnabled();
    if (
      current.planCode !== "free" &&
      current.status !== "cancelled" &&
      current.status !== "expired"
    ) {
      return Response.json(
        { error: "Cancel your current paid plan before choosing another one." },
        { status: 409 },
      );
    }
    if (sandboxDemo) {
      const plan = getSubscriptionPlan(body.planCode);
      const created = await createPayPalDemoOrder({
        userId: gate.id,
        planCode: body.planCode,
        amountUsd: plan.monthlyPriceUsd,
      });
      await markPayPalSubscriptionPending({
        userId: gate.id,
        planCode: body.planCode,
        subscriptionId: created.order.id,
        providerPlanId: payPalPlanId(body.planCode),
      });
      console.warn(
        `[PAYPAL SANDBOX DEMO] Opening a real PayPal Order for ${body.planCode}.`,
      );
      return Response.json({
        approvalUrl: created.approvalUrl,
        subscriptionId: created.order.id,
        demoOrder: true,
      });
    }
    if (current.status === "approval_pending" && current.providerSubscriptionId) {
      try {
        const pending = await getPayPalSubscription(current.providerSubscriptionId);
        const approvalUrl = pending.links?.find((link) => link.rel === "approve")?.href;
        if (approvalUrl && pending.plan_id === payPalPlanId(body.planCode)) {
          return Response.json({
            approvalUrl,
            subscriptionId: pending.id,
          });
        }
      } catch (error) {
        // A checkout created under replaced Sandbox credentials can remain pending
        // locally even though the current PayPal account cannot find it. Replace
        // only that confirmed missing resource; all other provider errors fail closed.
        if (!(error instanceof PayPalRequestError) || error.status !== 404) throw error;
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
