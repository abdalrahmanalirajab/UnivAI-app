// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limits", () => ({ enforceUserRateLimit: vi.fn(async () => null) }));

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  verifiedGate: vi.fn(),
  snapshot: vi.fn(),
  activateDevelopment: vi.fn(),
  abandonPending: vi.fn(),
  markPending: vi.fn(),
  reconcile: vi.fn(),
  cancelLocal: vi.fn(),
  recordEvent: vi.fn(),
  createDemoOrder: vi.fn(),
  captureDemoOrder: vi.fn(),
  createSubscription: vi.fn(),
  getSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  verifyWebhook: vi.fn(),
  planId: vi.fn(),
  planCode: vi.fn(),
  fakeSubscriptionEnabled: vi.fn(),
  enqueueNotification: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireUserApi: mocks.gate,
  requireStudentApi: mocks.gate,
  requireVerifiedUserApi: mocks.verifiedGate,
}));
vi.mock("@/lib/subscriptions", () => ({
  getSubscriptionSnapshot: mocks.snapshot,
  activateDevelopmentSubscription: mocks.activateDevelopment,
  abandonPendingSubscription: mocks.abandonPending,
  markPayPalSubscriptionPending: mocks.markPending,
  reconcilePayPalSubscription: mocks.reconcile,
  cancelLocalSubscription: mocks.cancelLocal,
  recordAndReconcilePayPalEvent: mocks.recordEvent,
}));
vi.mock("@/lib/paypal", () => ({
  PayPalConfigurationError: class PayPalConfigurationError extends Error {},
  PayPalRequestError: class PayPalRequestError extends Error {
    constructor(
      message: string,
      public readonly status = 400,
    ) {
      super(message);
    }
  },
  createPayPalSubscription: mocks.createSubscription,
  createPayPalDemoOrder: mocks.createDemoOrder,
  capturePayPalDemoOrder: mocks.captureDemoOrder,
  getPayPalSubscription: mocks.getSubscription,
  cancelPayPalSubscription: mocks.cancelSubscription,
  verifyPayPalWebhook: mocks.verifyWebhook,
  payPalPlanId: mocks.planId,
  planCodeForPayPalPlan: mocks.planCode,
  isPayPalFakeSubscriptionEnabled: mocks.fakeSubscriptionEnabled,
}));
vi.mock("@/lib/notification-outbox", () => ({
  enqueueEmailNotification: mocks.enqueueNotification,
}));

import { POST as createCheckout } from "@/app/api/subscriptions/paypal/create/route";
import { POST as abortCheckout } from "@/app/api/subscriptions/paypal/abort/route";
import { POST as confirmCheckout } from "@/app/api/subscriptions/paypal/confirm/route";
import { POST as captureDemoCheckout } from "@/app/api/subscriptions/paypal/demo-capture/route";
import { POST as cancelMembership } from "@/app/api/subscriptions/paypal/cancel/route";
import { POST as receiveWebhook } from "@/app/api/subscriptions/paypal/webhook/route";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  emailVerified: true,
};
const FREE = {
  planCode: "free",
  planName: "Free",
  monthlyPriceUsd: 0,
  weeklyCredits: 100,
  pendingPlanCode: null,
  status: "active",
  provider: "none",
  providerSubscriptionId: null,
  subscribedAt: null,
  currentPeriodEndsAt: null,
  cancelledAt: null,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  credits: {
    balance: 100,
    reservedBalance: 0,
    availableBalance: 100,
    weeklyGrantAmount: 100,
    nextGrantAt: "2026-08-17T00:00:00.000Z",
  },
  creditActivity: [],
  creditActivityPagination: { page: 1, pageSize: 10, total: 0, pages: 1 },
};

describe("PayPal subscription routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(USER);
    mocks.verifiedGate.mockResolvedValue(USER);
    mocks.snapshot.mockResolvedValue(FREE);
    mocks.planId.mockImplementation((code: string) => `P-${code.toUpperCase()}`);
    mocks.planCode.mockReturnValue("supporter");
    mocks.fakeSubscriptionEnabled.mockReturnValue(false);
    mocks.verifyWebhook.mockResolvedValue(true);
    mocks.recordEvent.mockResolvedValue("processed");
    mocks.enqueueNotification.mockResolvedValue({ queued: true });
  });

  it("requires authentication before creating a checkout", async () => {
    mocks.verifiedGate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        body: JSON.stringify({ planCode: "supporter" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createSubscription).not.toHaveBeenCalled();
  });

  it("blocks checkout until the account email is verified", async () => {
    mocks.verifiedGate.mockResolvedValue(
      Response.json(
        {
          error: "Verify your email to use this feature.",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 },
      ),
    );

    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "supporter" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
    expect(mocks.createSubscription).not.toHaveBeenCalled();
    expect(mocks.markPending).not.toHaveBeenCalled();
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

  it("uses a real one-time PayPal order for the sandbox presentation flow", async () => {
    mocks.fakeSubscriptionEnabled.mockReturnValue(true);
    mocks.createDemoOrder.mockResolvedValue({
      order: { id: "ORDER-DEMO", status: "PAYER_ACTION_REQUIRED" },
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-DEMO",
    });

    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "supporter" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-DEMO",
      subscriptionId: "ORDER-DEMO",
      demoOrder: true,
    });
    expect(mocks.createDemoOrder).toHaveBeenCalledWith({
      userId: USER.id,
      planCode: "supporter",
      amountUsd: 5,
    });
    expect(mocks.markPending).toHaveBeenCalledWith({
      userId: USER.id,
      planCode: "supporter",
      subscriptionId: "ORDER-DEMO",
      providerPlanId: "P-SUPPORTER",
    });
    expect(mocks.createSubscription).not.toHaveBeenCalled();
    expect(mocks.activateDevelopment).not.toHaveBeenCalled();
  });

  it("does not replace an active paid membership with another demo checkout", async () => {
    mocks.fakeSubscriptionEnabled.mockReturnValue(true);
    mocks.snapshot.mockResolvedValue({
      ...FREE,
      planCode: "patron",
      planName: "Patron",
      monthlyPriceUsd: 20,
      weeklyCredits: 1_000,
      status: "active",
    });

    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        body: JSON.stringify({ planCode: "supporter" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.createDemoOrder).not.toHaveBeenCalled();
    expect(mocks.markPending).not.toHaveBeenCalled();
  });

  it("restores the saved plan when a pending PayPal checkout is cancelled", async () => {
    const patron = {
      ...FREE,
      planCode: "patron",
      planName: "Patron",
      monthlyPriceUsd: 20,
      weeklyCredits: 1_000,
      status: "active",
    };
    mocks.snapshot.mockResolvedValue(patron);
    const response = await abortCheckout();

    expect(response.status).toBe(200);
    expect(mocks.abandonPending).toHaveBeenCalledWith(USER.id);
    await expect(response.json()).resolves.toEqual({ subscription: patron });
  });

  it("captures the approved demo order before activating the membership", async () => {
    const pending = {
      ...FREE,
      pendingPlanCode: "supporter",
      status: "approval_pending",
      provider: "paypal",
      providerSubscriptionId: "ORDER-DEMO",
    };
    const supporter = {
      ...FREE,
      planCode: "supporter",
      planName: "Supporter",
      monthlyPriceUsd: 5,
      weeklyCredits: 300,
      provider: "none",
    };
    mocks.fakeSubscriptionEnabled.mockReturnValue(true);
    mocks.snapshot.mockResolvedValue(pending);
    mocks.captureDemoOrder.mockResolvedValue({
      id: "ORDER-DEMO",
      status: "COMPLETED",
      purchase_units: [
        {
          reference_id: "supporter",
          custom_id: USER.id,
          payments: {
            captures: [
              { status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" } },
            ],
          },
        },
      ],
    });
    mocks.activateDevelopment.mockResolvedValue(supporter);

    const response = await captureDemoCheckout(
      new Request("http://localhost/api/subscriptions/paypal/demo-capture", {
        method: "POST",
        body: JSON.stringify({ orderId: "ORDER-DEMO" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      active: true,
      captureBypassed: false,
      subscription: supporter,
    });
    expect(mocks.activateDevelopment).toHaveBeenCalledWith({
      userId: USER.id,
      planCode: "supporter",
      paymentId: "ORDER-DEMO",
    });
    expect(mocks.enqueueNotification).toHaveBeenCalledWith({
      userId: USER.id,
      eventId: "paypal-demo:ORDER-DEMO:activated",
      event: { type: "billing.subscription_activated", planName: "Supporter" },
    });
  });

  it("revokes a local Sandbox membership without calling PayPal cancellation", async () => {
    const patron = {
      ...FREE,
      planCode: "patron",
      planName: "Patron",
      monthlyPriceUsd: 20,
      weeklyCredits: 1_000,
      status: "active",
      provider: "none",
      subscribedAt: "2026-08-11T12:00:00.000Z",
      currentPeriodEndsAt: "2026-09-11T12:00:00.000Z",
    };
    const revoked = {
      ...FREE,
      status: "cancelled",
      cancelledAt: "2026-08-12T12:00:00.000Z",
    };
    mocks.fakeSubscriptionEnabled.mockReturnValue(true);
    mocks.snapshot.mockResolvedValueOnce(patron).mockResolvedValueOnce(revoked);

    const response = await cancelMembership();

    expect(response.status).toBe(200);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.cancelLocal).toHaveBeenCalledWith({
      userId: USER.id,
      subscriptionId: null,
    });
    await expect(response.json()).resolves.toEqual({ subscription: revoked });
  });

  it("replaces a pending checkout that PayPal confirms is missing", async () => {
    mocks.snapshot.mockResolvedValue({
      ...FREE,
      pendingPlanCode: "supporter",
      status: "approval_pending",
      provider: "paypal",
      providerSubscriptionId: "I-MISSING",
    });
    const { PayPalRequestError } = await import("@/lib/paypal");
    mocks.getSubscription.mockRejectedValue(
      new PayPalRequestError("PayPal request failed with HTTP 404.", 404),
    );
    mocks.createSubscription.mockResolvedValue({
      subscription: { id: "I-REPLACEMENT", plan_id: "P-SUPPORTER" },
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=I-REPLACEMENT",
    });

    const response = await createCheckout(
      new Request("http://localhost/api/subscriptions/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "supporter" }),
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
      subscriptionId: "I-REPLACEMENT",
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
      weeklyCredits: 300,
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
        providerStartedAt: undefined,
        providerPeriodEndsAt: undefined,
      },
    });
    expect(mocks.enqueueNotification).toHaveBeenCalledWith({
      userId: USER.id,
      eventId: "paypal:I-SUPPORTER:activated",
      event: { type: "billing.subscription_activated", planName: "Supporter" },
    });
  });
});
