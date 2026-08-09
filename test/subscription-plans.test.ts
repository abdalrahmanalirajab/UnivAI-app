import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_PLANS,
  calculateWeeklyCoinGrant,
  startOfUtcWeek,
} from "@/lib/subscription-plans";

describe("fair subscription catalog", () => {
  it("offers the requested free, five-dollar and twenty-dollar monthly plans", () => {
    expect(
      SUBSCRIPTION_PLANS.map((plan) => [
        plan.code,
        plan.monthlyPriceUsd,
        plan.weeklyCoins,
      ]),
    ).toEqual([
      ["free", 0, 100],
      ["supporter", 5, 300],
      ["patron", 20, 1000],
    ]);
  });

  it("uses UTC Monday as the idempotent weekly boundary", () => {
    expect(startOfUtcWeek(new Date("2026-08-16T23:59:59.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
    expect(startOfUtcWeek(new Date("2026-08-17T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z",
    );
  });

  it("adds only one current-week grant and never backfills missed weeks", () => {
    expect(
      calculateWeeklyCoinGrant({
        balance: 75,
        previousAllowance: 100,
        nextAllowance: 100,
        storedWeekStartedAt: "2026-07-06",
        currentWeekStartedAt: "2026-08-17",
      }),
    ).toEqual({
      balance: 175,
      amount: 100,
      reason: "weekly_refill",
      shouldUpdateWallet: true,
    });
  });

  it("adds only the upgrade difference and never removes earned coins on downgrade", () => {
    expect(
      calculateWeeklyCoinGrant({
        balance: 120,
        previousAllowance: 100,
        nextAllowance: 300,
        storedWeekStartedAt: "2026-08-17",
        currentWeekStartedAt: "2026-08-17",
      }),
    ).toMatchObject({ balance: 320, amount: 200, reason: "plan_change" });
    expect(
      calculateWeeklyCoinGrant({
        balance: 320,
        previousAllowance: 300,
        nextAllowance: 100,
        storedWeekStartedAt: "2026-08-17",
        currentWeekStartedAt: "2026-08-17",
      }),
    ).toEqual({
      balance: 320,
      amount: 0,
      reason: null,
      shouldUpdateWallet: true,
    });
  });
});
