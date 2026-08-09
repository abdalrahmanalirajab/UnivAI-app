export const SUBSCRIPTION_PLAN_CODES = ["free", "supporter", "patron"] as const;

export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLAN_CODES)[number];

export type SubscriptionPlan = {
  code: SubscriptionPlanCode;
  name: string;
  monthlyPriceUsd: number;
  weeklyCoins: number;
  description: string;
};

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    code: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    weeklyCoins: 100,
    description: "The complete learning experience, plus weekly personalization coins.",
  },
  {
    code: "supporter",
    name: "Supporter",
    monthlyPriceUsd: 5,
    weeklyCoins: 300,
    description: "Support UnivAI and unlock more optional personalization each week.",
  },
  {
    code: "patron",
    name: "Patron",
    monthlyPriceUsd: 20,
    weeklyCoins: 1000,
    description: "Fund the platform and receive our largest personalization allowance.",
  },
] as const;

export const DEFAULT_SUBSCRIPTION_PLAN: SubscriptionPlanCode = "free";

export function isSubscriptionPlanCode(value: unknown): value is SubscriptionPlanCode {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_PLAN_CODES as readonly string[]).includes(value)
  );
}

export function getSubscriptionPlan(code: SubscriptionPlanCode): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((plan) => plan.code === code) ?? SUBSCRIPTION_PLANS[0];
}

export function startOfUtcWeek(value: Date): Date {
  const start = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start;
}

export function calculateWeeklyCoinGrant(input: {
  balance: number;
  previousAllowance: number;
  nextAllowance: number;
  storedWeekStartedAt: string;
  currentWeekStartedAt: string;
}): {
  balance: number;
  amount: number;
  reason: "weekly_refill" | "plan_change" | null;
  shouldUpdateWallet: boolean;
} {
  const changedWeek = input.storedWeekStartedAt !== input.currentWeekStartedAt;
  const amount = changedWeek
    ? input.nextAllowance
    : Math.max(0, input.nextAllowance - input.previousAllowance);
  return {
    balance: input.balance + amount,
    amount,
    reason: changedWeek ? "weekly_refill" : amount > 0 ? "plan_change" : null,
    shouldUpdateWallet:
      changedWeek || input.previousAllowance !== input.nextAllowance,
  };
}
