import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_PLANS,
  elapsedCreditGrantCount,
  nextCreditGrantAt,
} from "@/lib/subscription-plans";

describe("fair subscription catalog", () => {
  it("offers the requested free, five-dollar and twenty-dollar monthly plans", () => {
    expect(
      SUBSCRIPTION_PLANS.map((plan) => [
        plan.code,
        plan.monthlyPriceUsd,
        plan.weeklyCredits,
      ]),
    ).toEqual([
      ["free", 0, 100],
      ["supporter", 5, 300],
      ["patron", 20, 1000],
    ]);
  });

  it("uses an exact rolling seven-day cadence from signup or payment", () => {
    expect(nextCreditGrantAt(new Date("2026-08-16T23:59:59.000Z")).toISOString()).toBe(
      "2026-08-23T23:59:59.000Z",
    );
    expect(nextCreditGrantAt(new Date("2026-08-16T23:59:59.000Z"), 3).toISOString()).toBe(
      "2026-09-06T23:59:59.000Z",
    );
  });

  it("catches up every missed seven-day grant, including the due boundary", () => {
    const next = new Date("2026-07-27T12:00:00.000Z");
    expect(elapsedCreditGrantCount(next, new Date("2026-08-17T11:59:59.000Z"))).toBe(3);
    expect(elapsedCreditGrantCount(next, new Date("2026-08-17T12:00:00.000Z"))).toBe(4);
    expect(elapsedCreditGrantCount(next, new Date("2026-07-27T11:59:59.000Z"))).toBe(0);
  });
});
