import { randomUUID } from "node:crypto";
import { env } from "./env";
import type { SubscriptionPlanCode } from "./subscription-plans";

const ALLOWED_API_BASES = new Set([
  "https://api-m.sandbox.paypal.com",
  "https://api-m.paypal.com",
]);

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
  links?: PayPalLink[];
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
