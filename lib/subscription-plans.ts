export const SUBSCRIPTION_PLAN_CODES = ["free", "supporter", "patron"] as const;

export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLAN_CODES)[number];

export type SubscriptionPlan = {
  code: SubscriptionPlanCode;
  name: string;
  monthlyPriceUsd: number;
  weeklyCredits: number;
  description: string;
};

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    code: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    weeklyCredits: 100,
    description: "The complete learning experience, plus weekly learning Credits.",
  },
  {
    code: "supporter",
    name: "Supporter",
    monthlyPriceUsd: 5,
    weeklyCredits: 300,
    description: "Support UnivAI and receive 300 learning Credits every seven days.",
  },
  {
    code: "patron",
    name: "Patron",
    monthlyPriceUsd: 20,
    weeklyCredits: 1000,
    description: "Fund the platform and receive 1,000 learning Credits every seven days.",
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

/** A payment and every subsequent grant use an exact rolling seven-day cadence. */
export function nextCreditGrantAt(anchor: Date, intervals = 1): Date {
  if (!Number.isInteger(intervals) || intervals < 1) {
    throw new Error("intervals must be a positive integer");
  }
  return new Date(anchor.getTime() + intervals * 7 * 24 * 60 * 60 * 1000);
}

/** Number of complete scheduled grants due at `now`, including the due boundary. */
export function elapsedCreditGrantCount(nextGrantAt: Date, now: Date): number {
  if (nextGrantAt.getTime() > now.getTime()) return 0;
  return Math.floor(
    (now.getTime() - nextGrantAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
  ) + 1;
}
