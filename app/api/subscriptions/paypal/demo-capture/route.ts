import {
  capturePayPalDemoOrder,
  isPayPalFakeSubscriptionEnabled,
  PayPalConfigurationError,
  PayPalRequestError,
} from "@/lib/paypal";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireVerifiedUserApi } from "@/lib/session";
import { getSubscriptionPlan } from "@/lib/subscription-plans";
import {
  activateDevelopmentSubscription,
  getSubscriptionSnapshot,
} from "@/lib/subscriptions";

export async function POST(request: Request) {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;
  if (!isPayPalFakeSubscriptionEnabled()) {
    return Response.json({ error: "Sandbox demo checkout is disabled." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
  if (typeof body?.orderId !== "string") {
    return Response.json({ error: "Missing PayPal order." }, { status: 400 });
  }

  const current = await getSubscriptionSnapshot(gate.id);
  const planCode = current.pendingPlanCode;
  if (
    !planCode ||
    planCode === "free" ||
    current.status !== "approval_pending" ||
    current.providerSubscriptionId !== body.orderId
  ) {
    return Response.json({ error: "This is not your pending PayPal checkout." }, { status: 409 });
  }

  const plan = getSubscriptionPlan(planCode);
  let captureBypassed = false;
  try {
    const order = await capturePayPalDemoOrder(body.orderId);
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const amount = capture?.amount ?? unit?.amount;
    const valid =
      order.id === body.orderId &&
      order.status === "COMPLETED" &&
      unit?.custom_id === gate.id &&
      unit.reference_id === planCode &&
      capture?.status === "COMPLETED" &&
      amount?.currency_code === "USD" &&
      amount.value === plan.monthlyPriceUsd.toFixed(2);
    if (!valid) {
      return Response.json({ error: "PayPal returned an invalid completed order." }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (!(error instanceof PayPalRequestError)) {
      console.error("[PAYPAL SANDBOX DEMO] Unexpected capture failure", error);
      return Response.json({ error: "Could not complete the Sandbox checkout." }, { status: 502 });
    }
    captureBypassed = true;
    console.warn(
      `[PAYPAL SANDBOX DEMO] Capture returned HTTP ${error.status}; using the local presentation fallback.`,
    );
  }

  const subscription = await activateDevelopmentSubscription({
    userId: gate.id,
    planCode,
  });
  return Response.json({ active: true, captureBypassed, subscription });
}
