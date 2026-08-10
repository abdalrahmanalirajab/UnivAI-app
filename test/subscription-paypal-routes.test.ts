// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limits", () => ({ enforceUserRateLimit: vi.fn(async () => null) }));

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  snapshot: vi.fn(),
  markPending: vi.fn(),
  reconcile: vi.fn(),
  cancelLocal: vi.fn(),
  recordEvent: vi.fn(),
  createSubscription: vi.fn(),
  getSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyWebhook: vi.fn(),
  planId: vi.fn(),
  planCode: vi.fn(),
  enqueueNotification: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mocks.gate }));
vi.mock("@/lib/subscriptions", () => ({
  getSubscriptionSnapshot: mocks.snapshot,
  markPayPalSubscriptionPending: mocks.markPending,
  reconcilePayPalSubscription: mocks.reconcile,
  cancelLocalSubscription: mocks.cancelLocal,
  recordAndReconcilePayPalEvent: mocks.recordEvent,
}));
vi.mock("@/lib/paypal", () => ({
  PayPalConfigurationError: class PayPalConfigurationError extends Error {},
  PayPalRequestError: class PayPalRequestError extends Error {
    status = 400;
  },
  createPayPalSubscription: mocks.createSubscription,
  getPayPalSubscription: mocks.getSubscription,
  cancelPayPalSubscription: mocks.cancelSubscription,
  verifyPayPalWebhook: mocks.verifyWebhook,
  payPalPlanId: mocks.planId,
  planCodeForPayPalPlan: mocks.planCode,
}));
vi.mock("@/lib/notification-outbox", () => ({
  enqueueEmailNotification: mocks.enqueueNotification,
}));

import { POST as createCheckout } from "@/app/api/subscriptions/paypal/create/route";
import { POST as confirmCheckout } from "@/app/api/subscriptions/paypal/confirm/route";
import { POST as receiveWebhook } from "@/app/api/subscriptions/paypal/webhook/route";

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const FREE = {
  planCode: "free",
  planName: "Free",
  monthlyPriceUsd: 0,
  weeklyCoins: 100,
  pendingPlanCode: null,
  status: "active",
  provider: "none",
  providerSubscriptionId: null,
  coins: {
    balance: 100,
    weeklyAllowance: 100,
    weekStartedAt: "2026-08-10",
    nextGrantAt: "2026-08-17T00:00:00.000Z",
  },
};

describe("PayPal subscription routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(USER);
    mocks.snapshot.mockResolvedValue(FREE);
    mocks.planId.mockImplementation((code: string) => `P-${code.toUpperCase()}`);
    mocks.planCode.mockReturnValue("supporter");
    mocks.verifyWebhook.mockResolvedValue(true);
    mocks.recordEvent.mockResolvedValue("processed");
    mocks.enqueueNotification.mockResolvedValue({ queued: true });
  });

  it("requires authentication before creating a checkout", async () => {
    mocks.gate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        body: JSON.stringify({ planCode: "supporter" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createSubscription).not.toHaveBeenCalled();
  });

  it("rejects free, unknown and client-priced checkout payloads", async () => {
    for (const planCode of ["free", "elite", 5]) {
      const response = await createCheckout(
        new Request("http://localhost/api/subscriptions/paypal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planCode, price: 0.01 }),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.createSubscription).not.toHaveBeenCalled();
  });

  it("uses the signed-in user and server-owned plan mapping", async () => {
    mocks.createSubscription.mockResolvedValue({
      subscription: { id: "I-SUPPORTER", plan_id: "P-SUPPORTER" },
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=I-SUPPORTER",
    });
    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: "supporter",
          price: 0.01,
          userId: "attacker-controlled",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.createSubscription).toHaveBeenCalledWith({
      userId: USER.id,
      planCode: "supporter",
    });
    expect(mocks.markPending).toHaveBeenCalledWith({
      userId: USER.id,
      planCode: "supporter",
      subscriptionId: "I-SUPPORTER",
      providerPlanId: "P-SUPPORTER",
    });
  });

  it("never activates a subscription owned by another user", async () => {
    mocks.getSubscription.mockResolvedValue({
      id: "I-OTHER",
      plan_id: "P-SUPPORTER",
      custom_id: "22222222-2222-4222-8222-222222222222",
      status: "ACTIVE",
    });
    const response = await confirmCheckout(
      new Request("http://localhost/api/subscriptions/paypal/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: "I-OTHER" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("queues one billing email after a verified activation", async () => {
    const SUPPORTER = {
      ...FREE,
      planCode: "supporter",
      planName: "Supporter",
      monthlyPriceUsd: 5,
      weeklyCoins: 300,
      status: "active",
      provider: "paypal",
      providerSubscriptionId: "I-SUPPORTER",
    };
    mocks.getSubscription.mockResolvedValue({
      id: "I-SUPPORTER",
      plan_id: "P-SUPPORTER",
      custom_id: USER.id,
      status: "ACTIVE",
    });
    mocks.snapshot.mockResolvedValueOnce(FREE).mockResolvedValueOnce(SUPPORTER);

    const response = await confirmCheckout(
      new Request("http://localhost/api/subscriptions/paypal/confirm", {
        method: "POST",
        body: JSON.stringify({ subscriptionId: "I-SUPPORTER" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueNotification).toHaveBeenCalledWith({
      userId: USER.id,
      eventId: "paypal:I-SUPPORTER:activated",
      event: { type: "billing.subscription_activated", planName: "Supporter" },
    });
  });

  it("rejects an unverified webhook before reading provider state", async () => {
    mocks.verifyWebhook.mockResolvedValue(false);
    const response = await receiveWebhook(
      new Request("http://localhost/api/subscriptions/paypal/webhook", {
        method: "POST",
        body: JSON.stringify({
          id: "WH-1",
          event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
          resource: { id: "I-SUPPORTER" },
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });

  it("re-reads PayPal and sends a verified event through idempotent reconciliation", async () => {
    mocks.getSubscription.mockResolvedValue({
      id: "I-SUPPORTER",
      plan_id: "P-SUPPORTER",
      custom_id: USER.id,
      status: "ACTIVE",
    });
    const response = await receiveWebhook(
      new Request("http://localhost/api/subscriptions/paypal/webhook", {
        method: "POST",
        body: JSON.stringify({
          id: "WH-2",
          event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
          resource: { id: "I-SUPPORTER" },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.recordEvent).toHaveBeenCalledWith({
      eventId: "WH-2",
      eventType: "BILLING.SUBSCRIPTION.ACTIVATED",
      subscription: {
        id: "I-SUPPORTER",
        customId: USER.id,
        planCode: "supporter",
        providerPlanId: "P-SUPPORTER",
        status: "ACTIVE",
      },
    });
    expect(mocks.enqueueNotification).toHaveBeenCalledWith({
      userId: USER.id,
      eventId: "paypal:I-SUPPORTER:activated",
      event: { type: "billing.subscription_activated", planName: "Supporter" },
    });
  });
});
