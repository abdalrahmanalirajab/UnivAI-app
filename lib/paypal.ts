import { randomUUID } from "node:crypto";
import { env } from "./env";
import type { SubscriptionPlanCode } from "./subscription-plans";

const ALLOWED_API_BASES = new Set([
  "https://api-m.sandbox.paypal.com",
  "https://api-m.paypal.com",
]);
const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";

type PayPalLink = {
  href?: string;
  rel?: string;
  method?: string;
};

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  custom_id?: string;
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
  };
  links?: PayPalLink[];
};

export type PayPalOrder = {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: {
      captures?: Array<{
        status?: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
};

type AccessTokenState = {
  value: string;
  expiresAt: number;
};

const globalForPayPal = globalThis as unknown as {
  univaiPayPalAccessToken?: AccessTokenState;
};

export class PayPalConfigurationError extends Error {}
export class PayPalRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function apiBase(): string {
  const base = env.PAYPAL_API_BASE.replace(/\/$/, "");
  if (!ALLOWED_API_BASES.has(base)) {
    throw new PayPalConfigurationError("PAYPAL_API_BASE must be an official PayPal API origin.");
  }
  return base;
}

export function isPayPalFakeSubscriptionEnabled(): boolean {
  const enabled = ["1", "true", "yes", "on"].includes(
    env.PAYPAL_FAKE_SUBSCRIPTION.trim().toLowerCase(),
  );
  return (
    enabled &&
    process.env.NODE_ENV !== "production" &&
    apiBase() === SANDBOX_API_BASE
  );
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new PayPalConfigurationError("PayPal Sandbox credentials are not configured.");
  }
  return {
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
  };
}

export function payPalPlanId(
  code: Exclude<SubscriptionPlanCode, "free">,
): string {
  const value =
    code === "supporter"
      ? env.PAYPAL_SUPPORTER_PLAN_ID
      : env.PAYPAL_PATRON_PLAN_ID;
  if (!value) {
    throw new PayPalConfigurationError(
      `The PayPal ${code} plan is not configured. Run the PayPal plan setup script.`,
    );
  }
  return value;
}

export function planCodeForPayPalPlan(
  planId: string,
): Exclude<SubscriptionPlanCode, "free"> | null {
  if (planId && planId === env.PAYPAL_SUPPORTER_PLAN_ID) return "supporter";
  if (planId && planId === env.PAYPAL_PATRON_PLAN_ID) return "patron";
  return null;
}

async function accessToken(): Promise<string> {
  const cached = globalForPayPal.univaiPayPalAccessToken;
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const { clientId, clientSecret } = requireCredentials();
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new PayPalRequestError("PayPal authentication failed.", response.status);
  }
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new PayPalRequestError("PayPal returned no access token.", 502);
  }
  globalForPayPal.univaiPayPalAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1_000,
  };
  return body.access_token;
}

export async function payPalRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new PayPalRequestError(
      `PayPal request failed with HTTP ${response.status}.`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function createPayPalSubscription(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
}): Promise<{ subscription: PayPalSubscription; approvalUrl: string }> {
  const planId = payPalPlanId(input.planCode);
  const subscription = await payPalRequest<PayPalSubscription>(
    "/v1/billing/subscriptions",
    {
      method: "POST",
      headers: {
        "PayPal-Request-Id": randomUUID(),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: input.userId,
        application_context: {
          brand_name: "UnivAI",
          locale: "en-US",
          user_action: "SUBSCRIBE_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${env.BETTER_AUTH_URL}/subscribe/paypal/return`,
          cancel_url: `${env.BETTER_AUTH_URL}/subscribe?cancelled=1`,
        },
      }),
    },
  );
  const approvalUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
  if (!subscription.id || !approvalUrl) {
    throw new PayPalRequestError("PayPal returned an incomplete subscription.", 502);
  }
  return { subscription, approvalUrl };
}

export async function createPayPalDemoOrder(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
  amountUsd: number;
}): Promise<{ order: PayPalOrder; approvalUrl: string }> {
  if (!isPayPalFakeSubscriptionEnabled()) {
    throw new PayPalConfigurationError("The PayPal demo checkout is disabled.");
  }
  const order = await payPalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    headers: {
      "PayPal-Request-Id": randomUUID(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.planCode,
          custom_id: input.userId,
          description: `UnivAI ${input.planCode} presentation membership`,
          amount: {
            currency_code: "USD",
            value: input.amountUsd.toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "UnivAI",
            locale: "en-US",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${env.BETTER_AUTH_URL}/subscribe/paypal/return?demo_order=1`,
            cancel_url: `${env.BETTER_AUTH_URL}/subscribe?cancelled=1`,
          },
        },
      },
    }),
  });
  const approvalUrl = order.links?.find((link) =>
    ["payer-action", "approve"].includes(link.rel ?? ""),
  )?.href;
  if (!order.id || !approvalUrl) {
    throw new PayPalRequestError("PayPal returned an incomplete demo order.", 502);
  }
  return { order, approvalUrl };
}

export async function capturePayPalDemoOrder(orderId: string): Promise<PayPalOrder> {
  if (!isPayPalFakeSubscriptionEnabled()) {
    throw new PayPalConfigurationError("The PayPal demo checkout is disabled.");
  }
  if (!/^[A-Z0-9-]{3,64}$/i.test(orderId)) {
    throw new PayPalRequestError("Invalid PayPal order identifier.", 400);
  }
  return payPalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `capture-${orderId}`,
        Prefer: "return=representation",
      },
      body: "{}",
    },
  );
}

export async function getPayPalSubscription(id: string): Promise<PayPalSubscription> {
  if (!/^[A-Z0-9-]{3,64}$/i.test(id)) {
    throw new PayPalRequestError("Invalid PayPal subscription identifier.", 400);
  }
  return payPalRequest<PayPalSubscription>(
    `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
  );
}

export async function cancelPayPalSubscription(id: string): Promise<void> {
  if (!/^[A-Z0-9-]{3,64}$/i.test(id)) {
    throw new PayPalRequestError("Invalid PayPal subscription identifier.", 400);
  }
  await payPalRequest<void>(
    `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled by the learner in UnivAI." }),
    },
  );
}

export async function verifyPayPalWebhook(input: {
  headers: Headers;
  event: unknown;
}): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) {
    throw new PayPalConfigurationError("PAYPAL_WEBHOOK_ID is not configured.");
  }
  const required = {
    transmission_id: input.headers.get("paypal-transmission-id"),
    transmission_time: input.headers.get("paypal-transmission-time"),
    cert_url: input.headers.get("paypal-cert-url"),
    auth_algo: input.headers.get("paypal-auth-algo"),
    transmission_sig: input.headers.get("paypal-transmission-sig"),
  };
  if (Object.values(required).some((value) => !value)) return false;

  const response = await payPalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        ...required,
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: input.event,
      }),
    },
  );
  return response.verification_status === "SUCCESS";
}
