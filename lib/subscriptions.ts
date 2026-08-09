import { pool } from "./db";
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  calculateWeeklyCoinGrant,
  getSubscriptionPlan,
  isSubscriptionPlanCode,
  startOfUtcWeek,
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
};

type WalletRow = {
  balance: number;
  weekly_allowance: number;
  week_started_at: Date | string;
};

export type SubscriptionSnapshot = {
  planCode: SubscriptionPlanCode;
  planName: string;
  monthlyPriceUsd: number;
  weeklyCoins: number;
  pendingPlanCode: SubscriptionPlanCode | null;
  status: SubscriptionStatus;
  provider: "none" | "paypal";
  providerSubscriptionId: string | null;
  coins: {
    balance: number;
    weeklyAllowance: number;
    weekStartedAt: string;
    nextGrantAt: string;
  };
};

function nextWeek(start: Date): Date {
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10);
}

function pendingPlan(value: string | null): SubscriptionPlanCode | null {
  return isSubscriptionPlanCode(value) && value !== "free" ? value : null;
}

export async function getSubscriptionSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<SubscriptionSnapshot> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO user_subscriptions (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    await client.query(
      `INSERT INTO coin_wallets (user_id, balance, weekly_allowance)
       VALUES ($1, 100, 100)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const subscriptionResult = await client.query<SubscriptionRow>(
      `SELECT plan_code, pending_plan_code, status, provider,
              provider_subscription_id, provider_plan_id
         FROM user_subscriptions
        WHERE user_id = $1
        FOR UPDATE`,
      [userId],
    );
    const walletResult = await client.query<WalletRow>(
      `SELECT balance, weekly_allowance, week_started_at
         FROM coin_wallets
        WHERE user_id = $1
        FOR UPDATE`,
      [userId],
    );
    const subscription = subscriptionResult.rows[0];
    const wallet = walletResult.rows[0];
    if (!subscription || !wallet) {
      throw new Error("Could not initialize subscription benefits.");
    }

    const planCode = isSubscriptionPlanCode(subscription.plan_code)
      ? subscription.plan_code
      : DEFAULT_SUBSCRIPTION_PLAN;
    const plan = getSubscriptionPlan(planCode);
    const weekStart = startOfUtcWeek(now);
    const storedWeek = new Date(`${isoDate(wallet.week_started_at)}T00:00:00.000Z`);
    const grant = calculateWeeklyCoinGrant({
      balance: wallet.balance,
      previousAllowance: wallet.weekly_allowance,
      nextAllowance: plan.weeklyCoins,
      storedWeekStartedAt: isoDate(storedWeek),
      currentWeekStartedAt: isoDate(weekStart),
    });
    const { amount, balance } = grant;

    if (grant.shouldUpdateWallet) {
      await client.query(
        `UPDATE coin_wallets
            SET balance = $2,
                weekly_allowance = $3,
                week_started_at = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1`,
        [userId, balance, plan.weeklyCoins, isoDate(weekStart)],
      );
    }
    if (amount > 0 && grant.reason) {
      await client.query(
        `INSERT INTO coin_transactions
           (user_id, amount, balance_after, reason, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          userId,
          amount,
          balance,
          grant.reason,
          `${grant.reason}:${userId}:${isoDate(weekStart)}:${plan.code}`,
        ],
      );
    }

    await client.query("COMMIT");
    return {
      planCode,
      planName: plan.name,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      weeklyCoins: plan.weeklyCoins,
      pendingPlanCode: pendingPlan(subscription.pending_plan_code),
      status: subscription.status,
      provider: subscription.provider,
      providerSubscriptionId: subscription.provider_subscription_id,
      coins: {
        balance,
        weeklyAllowance: plan.weeklyCoins,
        weekStartedAt: isoDate(weekStart),
        nextGrantAt: nextWeek(weekStart).toISOString(),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

export async function reconcilePayPalSubscription(input: {
  userId: string;
  planCode: Exclude<SubscriptionPlanCode, "free">;
  subscriptionId: string;
  providerPlanId: string;
  providerStatus: string;
}): Promise<void> {
  const status = mappedStatus(input.providerStatus);
  const active = status === "active";
  await pool.query(
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
      active ? input.planCode : DEFAULT_SUBSCRIPTION_PLAN,
      isPendingStatus(status) ? input.planCode : null,
      status,
      input.subscriptionId,
      input.providerPlanId,
    ],
  );
  await getSubscriptionSnapshot(input.userId);
}

export async function cancelLocalSubscription(input: {
  userId: string;
  subscriptionId: string;
}): Promise<void> {
  await pool.query(
    `UPDATE user_subscriptions
        SET plan_code = 'free', pending_plan_code = NULL, status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND provider_subscription_id = $2`,
    [input.userId, input.subscriptionId],
  );
  await getSubscriptionSnapshot(input.userId);
}

export async function recordAndReconcilePayPalEvent(input: {
  eventId: string;
  eventType: string;
  subscription: {
    id: string;
    customId: string;
    planCode: Exclude<SubscriptionPlanCode, "free">;
    providerPlanId: string;
    status: string;
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

    const status = mappedStatus(input.subscription.status);
    const active = status === "active";
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
        input.subscription.customId,
        active ? input.subscription.planCode : DEFAULT_SUBSCRIPTION_PLAN,
        isPendingStatus(status) ? input.subscription.planCode : null,
        status,
        input.subscription.id,
        input.subscription.providerPlanId,
      ],
    );
    await client.query("COMMIT");
    await getSubscriptionSnapshot(input.subscription.customId);
    return "processed";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
