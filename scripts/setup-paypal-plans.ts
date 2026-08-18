import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env";
import { payPalRequest } from "../lib/paypal";

type ProductResponse = { id: string };
type PlanResponse = { id: string; status?: string };
type WebhookResponse = { id: string };

const envPath = path.resolve(process.cwd(), "..", ".env");

async function setEnvValues(values: Record<string, string>) {
  const raw = await readFile(envPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${key}=`).test(line));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  await writeFile(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

async function createProduct(): Promise<string> {
  const product = await payPalRequest<ProductResponse>("/v1/catalogs/products", {
    method: "POST",
    headers: {
      "PayPal-Request-Id": "univai-study-credits-product-v2",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name: "UnivAI Support Membership",
      description: "Optional weekly learning-action Credits. Academic access is always free.",
      type: "SERVICE",
      category: "EDUCATIONAL_AND_TEXTBOOKS",
    }),
  });
  if (!product.id) throw new Error("PayPal returned no product ID.");
  return product.id;
}

async function createPlan(input: {
  productId: string;
  code: "supporter" | "patron";
  name: string;
  price: string;
}): Promise<string> {
  const plan = await payPalRequest<PlanResponse>("/v1/billing/plans", {
    method: "POST",
    headers: {
      "PayPal-Request-Id": `univai-${input.code}-monthly-v1`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      product_id: input.productId,
      name: `UnivAI ${input.name}`,
      description: `${input.name} membership with optional weekly learning-action Credits.`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: input.price, currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: "0", currency_code: "USD" },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
      taxes: { percentage: "0", inclusive: true },
    }),
  });
  if (!plan.id) throw new Error(`PayPal returned no ${input.name} plan ID.`);
  if (plan.status && plan.status !== "ACTIVE") {
    await payPalRequest<void>(`/v1/billing/plans/${encodeURIComponent(plan.id)}/activate`, {
      method: "POST",
    });
  }
  return plan.id;
}

async function createWebhook(url: string): Promise<string> {
  if (!url.startsWith("https://")) {
    throw new Error("PAYPAL_WEBHOOK_URL must be a public HTTPS URL.");
  }
  const webhook = await payPalRequest<WebhookResponse>("/v1/notifications/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      event_types: [
        "BILLING.SUBSCRIPTION.ACTIVATED",
        "BILLING.SUBSCRIPTION.UPDATED",
        "BILLING.SUBSCRIPTION.SUSPENDED",
        "BILLING.SUBSCRIPTION.CANCELLED",
        "BILLING.SUBSCRIPTION.EXPIRED",
        "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
        "PAYMENT.SALE.COMPLETED",
      ].map((name) => ({ name })),
    }),
  });
  if (!webhook.id) throw new Error("PayPal returned no webhook ID.");
  return webhook.id;
}

async function main() {
  const updates: Record<string, string> = {};
  const productId = env.PAYPAL_PRODUCT_ID || (await createProduct());
  if (!env.PAYPAL_PRODUCT_ID) updates.PAYPAL_PRODUCT_ID = productId;

  const supporterId =
    env.PAYPAL_SUPPORTER_PLAN_ID ||
    (await createPlan({
      productId,
      code: "supporter",
      name: "Supporter",
      price: "5.00",
    }));
  if (!env.PAYPAL_SUPPORTER_PLAN_ID) updates.PAYPAL_SUPPORTER_PLAN_ID = supporterId;

  const patronId =
    env.PAYPAL_PATRON_PLAN_ID ||
    (await createPlan({
      productId,
      code: "patron",
      name: "Patron",
      price: "20.00",
    }));
  if (!env.PAYPAL_PATRON_PLAN_ID) updates.PAYPAL_PATRON_PLAN_ID = patronId;

  const webhookId =
    env.PAYPAL_WEBHOOK_ID ||
    (env.PAYPAL_WEBHOOK_URL ? await createWebhook(env.PAYPAL_WEBHOOK_URL) : "");
  if (!env.PAYPAL_WEBHOOK_ID && webhookId) updates.PAYPAL_WEBHOOK_ID = webhookId;

  if (Object.keys(updates).length) await setEnvValues(updates);
  console.log(`PayPal Sandbox product: ${productId}`);
  console.log(`Supporter monthly plan: ${supporterId}`);
  console.log(`Patron monthly plan: ${patronId}`);
  console.log("Plan IDs were saved to the ignored campus .env.");
  if (webhookId) {
    console.log(`Subscription webhook: ${webhookId}`);
  } else {
    console.log("Set PAYPAL_WEBHOOK_URL to the deployed HTTPS endpoint, then rerun this script.");
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
