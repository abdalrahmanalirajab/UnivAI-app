import "server-only";

import type { PoolClient } from "pg";
import { pool } from "./db";
import {
  catchUpCreditGrantsWithClient,
  getCreditActivity,
  grantSubscriptionPaymentWithClient,
  type CreditTransaction,
  type CreditWallet,
  type Pagination,
} from "./credits";
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  getSubscriptionPlan,
  isSubscriptionPlanCode,
  type SubscriptionPlanCode,
} from "./subscription-plans";

export type SubscriptionStatus =
  | "active"
  | "approval_pending"
  | "suspended"
  | "cancelled"
  | "expired";

type SubscriptionRow = {
  plan_code: string;
  pending_plan_code: string | null;
  status: SubscriptionStatus;
  provider: "none" | "paypal";
  provider_subscription_id: string | null;
  provider_plan_id: string | null;
  subscribed_at: Date | string | null;
  current_period_ends_at: Date | string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type SubscriptionSnapshot = {
  planCode: SubscriptionPlanCode;
  planName: string;
  monthlyPriceUsd: number;
  weeklyCredits: number;
  pendingPlanCode: SubscriptionPlanCode | null;
  status: SubscriptionStatus;
  provider: "none" | "paypal";
  providerSubscriptionId: string | null;
  subscribedAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  credits: CreditWallet;
  creditActivity: CreditTransaction[];
  creditActivityPagination: Pagination;
};

function isoTimestamp(value: Date | string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function pendingPlan(value: string | null): SubscriptionPlanCode | null {
  return isSubscriptionPlanCode(value) && value !== "free" ? value : null;
}

async function ensureSubscription(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO user_subscriptions (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

export async function getSubscriptionSnapshot(
  userId: string,
  options: { activityPage?: number; activityPageSize?: number; now?: Date } = {},
): Promise<SubscriptionSnapshot> {
  await pool.query(
    `INSERT INTO user_subscriptions (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const [subscriptionResult, activity] = await Promise.all([
    pool.query<SubscriptionRow>(
      `SELECT plan_code, pending_plan_code, status, provider,
              provider_subscription_id, provider_plan_id,
              subscribed_at, current_period_ends_at, cancelled_at,
              created_at, updated_at
         FROM user_subscriptions
        WHERE user_id = $1`,
      [userId],
    ),
    getCreditActivity(userId, {
      page: options.activityPage,
      pageSize: options.activityPageSize,
      now: options.now,
    }),
  ]);
  const subscription = subscriptionResult.rows[0];
  if (!subscription) throw new Error("Could not initialize subscription benefits.");
  const planCode = isSubscriptionPlanCode(subscription.plan_code)
    ? subscription.plan_code
    : DEFAULT_SUBSCRIPTION_PLAN;
  const plan = getSubscriptionPlan(planCode);
  return {
    planCode,
    planName: plan.name,
    monthlyPriceUsd: plan.monthlyPriceUsd,
    weeklyCredits: plan.weeklyCredits,
    pendingPlanCode: pendingPlan(subscription.pending_plan_code),
    status: subscription.status,
    provider: subscription.provider,
    providerSubscriptionId: subscription.provider_subscription_id,
    subscribedAt: isoTimestamp(subscription.subscribed_at),
    currentPeriodEndsAt: isoTimestamp(subscription.current_period_ends_at),
    cancelledAt: isoTimestamp(subscription.cancelled_at),
    createdAt: isoTimestamp(subscription.created_at)!,
    updatedAt: isoTimestamp(subscription.updated_at)!,
    credits: activity.wallet,
    creditActivity: activity.items,
    creditActivityPagination: activity.pagination,
  };
}

export async function markPayPalSubscriptionPending(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
  subscriptionId: string;
  providerPlanId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO user_subscriptions
       (user_id, plan_code, pending_plan_code, status, provider,
        provider_subscription_id, provider_plan_id)
     VALUES ($1, 'free', $2, 'approval_pending', 'paypal', $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       pending_plan_code = EXCLUDED.pending_plan_code,
       status = 'approval_pending',
       provider = 'paypal',
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       provider_plan_id = EXCLUDED.provider_plan_id,
       updated_at = CURRENT_TIMESTAMP`,
    [input.userId, input.planCode, input.subscriptionId, input.providerPlanId],
  );
}

export async function activateDevelopmentSubscription(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
  paymentId: string;
}): Promise<SubscriptionSnapshot> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development subscriptions cannot be activated in production.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSubscription(client, input.userId);
    await client.query(
      `UPDATE user_subscriptions
          SET plan_code = $2, pending_plan_code = NULL, status = 'active',
              provider = 'none', provider_subscription_id = NULL,
              provider_plan_id = NULL, subscribed_at = CURRENT_TIMESTAMP,
              current_period_ends_at = CURRENT_TIMESTAMP + INTERVAL '1 month',
              cancelled_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1`,
      [input.userId, input.planCode],
    );
    await grantSubscriptionPaymentWithClient(client, {
      userId: input.userId,
      amount: getSubscriptionPlan(input.planCode).weeklyCredits,
      planCode: input.planCode,
      provider: "paypal-sandbox",
      paymentId: input.paymentId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getSubscriptionSnapshot(input.userId);
}

export async function abandonPendingSubscription(userId: string): Promise<void> {
  await pool.query(
    `UPDATE user_subscriptions
        SET pending_plan_code = NULL, status = 'active', provider = 'none',
            provider_subscription_id = NULL, provider_plan_id = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND status = 'approval_pending'`,
    [userId],
  );
}

function mappedStatus(providerStatus: string): SubscriptionStatus {
  const statuses: Record<string, SubscriptionStatus> = {
    ACTIVE: "active",
    APPROVAL_PENDING: "approval_pending",
    APPROVED: "approval_pending",
    SUSPENDED: "suspended",
    CANCELLED: "cancelled",
    EXPIRED: "expired",
  };
  return statuses[providerStatus.toUpperCase()] ?? "approval_pending";
}

function isPendingStatus(status: SubscriptionStatus): boolean {
  return status === "approval_pending";
}

async function reconcileWithClient(
  client: PoolClient,
  input: {
    userId: string;
    planCode: Exclude<SubscriptionPlanCode, "free">;
    subscriptionId: string;
    providerPlanId: string;
    providerStatus: string;
    providerStartedAt?: string;
    providerPeriodEndsAt?: string;
  },
): Promise<void> {
  const status = mappedStatus(input.providerStatus);
  const active = status === "active";
  const retainsPaidPlan = active || status === "suspended";
  await client.query(
    `INSERT INTO user_subscriptions
       (user_id, plan_code, pending_plan_code, status, provider,
        provider_subscription_id, provider_plan_id)
     VALUES ($1, $2, $3, $4, 'paypal', $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       plan_code = EXCLUDED.plan_code,
       pending_plan_code = EXCLUDED.pending_plan_code,
       status = EXCLUDED.status,
       provider = 'paypal',
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       provider_plan_id = EXCLUDED.provider_plan_id,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.userId,
      retainsPaidPlan ? input.planCode : DEFAULT_SUBSCRIPTION_PLAN,
      isPendingStatus(status) ? input.planCode : null,
      status,
      input.subscriptionId,
      input.providerPlanId,
    ],
  );
  if (active) {
    await client.query(
      `UPDATE user_subscriptions
          SET subscribed_at = COALESCE(subscribed_at, $2::timestamptz, CURRENT_TIMESTAMP),
              current_period_ends_at = COALESCE($3::timestamptz, CURRENT_TIMESTAMP + INTERVAL '1 month'),
              cancelled_at = NULL
        WHERE user_id = $1`,
      [input.userId, input.providerStartedAt ?? null, input.providerPeriodEndsAt ?? null],
    );
  } else if (status === "cancelled" || status === "expired") {
    await client.query(
      `UPDATE user_subscriptions
          SET current_period_ends_at = COALESCE(current_period_ends_at, CURRENT_TIMESTAMP),
              cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP)
        WHERE user_id = $1`,
      [input.userId],
    );
    await catchUpCreditGrantsWithClient(client, input.userId);
    await client.query(
      `UPDATE credit_wallets
          SET weekly_grant_amount = $2,
              next_grant_at = CURRENT_TIMESTAMP + INTERVAL '7 days',
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1`,
      [input.userId, getSubscriptionPlan(DEFAULT_SUBSCRIPTION_PLAN).weeklyCredits],
    );
  }
}

export async function reconcilePayPalSubscription(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
  subscriptionId: string;
  providerPlanId: string;
  providerStatus: string;
  providerStartedAt?: string;
  providerPeriodEndsAt?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await reconcileWithClient(client, input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelLocalSubscription(input: {
  userId: string;
  subscriptionId: string | null;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await catchUpCreditGrantsWithClient(client, input.userId);
    const updated = await client.query(
      `UPDATE user_subscriptions
          SET plan_code = 'free', pending_plan_code = NULL, status = 'cancelled',
              current_period_ends_at = CURRENT_TIMESTAMP,
              cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
          AND ($2::text IS NULL OR provider_subscription_id = $2)`,
      [input.userId, input.subscriptionId],
    );
    if (updated.rowCount !== 1) throw new Error("Subscription could not be cancelled.");
    await client.query(
      `UPDATE credit_wallets
          SET weekly_grant_amount = $2,
              next_grant_at = CURRENT_TIMESTAMP + INTERVAL '7 days',
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1`,
      [input.userId, getSubscriptionPlan(DEFAULT_SUBSCRIPTION_PLAN).weeklyCredits],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordAndReconcilePayPalEvent(input: {
  eventId: string;
  eventType: string;
  paymentId?: string;
  paidAt?: string;
  subscription: {
    id: string;
    customId: string;
    planCode: Exclude<SubscriptionPlanCode, "free">;
    providerPlanId: string;
    status: string;
    providerStartedAt?: string;
    providerPeriodEndsAt?: string;
  };
}): Promise<"processed" | "duplicate"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO payment_webhook_events
         (event_id, event_type, provider_subscription_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [input.eventId, input.eventType, input.subscription.id],
    );
    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return "duplicate";
    }

    await reconcileWithClient(client, {
      userId: input.subscription.customId,
      planCode: input.subscription.planCode,
      subscriptionId: input.subscription.id,
      providerPlanId: input.subscription.providerPlanId,
      providerStatus: input.subscription.status,
      providerStartedAt: input.subscription.providerStartedAt,
      providerPeriodEndsAt: input.subscription.providerPeriodEndsAt,
    });
    if (input.eventType === "PAYMENT.SALE.COMPLETED" && input.paymentId) {
      await grantSubscriptionPaymentWithClient(client, {
        userId: input.subscription.customId,
        amount: getSubscriptionPlan(input.subscription.planCode).weeklyCredits,
        planCode: input.subscription.planCode,
        provider: "paypal",
        paymentId: input.paymentId,
        paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
      });
    }
    await client.query("COMMIT");
    return "processed";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
