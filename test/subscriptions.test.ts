import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCreditActivity: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { query: mocks.query },
}));

vi.mock("@/lib/credits", () => ({
  getCreditActivity: mocks.getCreditActivity,
}));

import { getSubscriptionSnapshot } from "@/lib/subscriptions";

describe("subscription wallet snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCreditActivity.mockResolvedValue({
      wallet: {
        balance: 1100,
        reservedBalance: 0,
        availableBalance: 1100,
        weeklyGrantAmount: 1000,
        nextGrantAt: "2026-08-18T12:00:00.000Z",
      },
      items: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: 1000,
        balanceAfter: 1100,
        reason: "subscription_payment",
        referenceType: "subscription_plan",
        referenceId: "patron",
        metadata: { provider: "paypal" },
        createdAt: "2026-08-11T12:00:00.000Z",
      }],
      pagination: { page: 2, pageSize: 10, total: 11, pages: 2 },
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT plan_code")) {
        return {
          rows: [
            {
              plan_code: "patron",
              pending_plan_code: null,
              status: "active",
              provider: "none",
              provider_subscription_id: null,
              provider_plan_id: null,
              subscribed_at: "2026-08-11T12:00:00.000Z",
              current_period_ends_at: "2026-09-11T12:00:00.000Z",
              cancelled_at: null,
              created_at: "2026-08-10T00:00:00.000Z",
              updated_at: "2026-08-10T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  it("returns the additive Credit balance and requested activity page", async () => {
    const snapshot = await getSubscriptionSnapshot(
      "fc69fd54-552a-49d3-a4c7-84bf174b6c95",
      { activityPage: 2, activityPageSize: 10, now: new Date("2026-08-11T12:00:00.000Z") },
    );

    expect(snapshot.credits.balance).toBe(1100);
    expect(snapshot.weeklyCredits).toBe(1000);
    expect(snapshot.creditActivity[0]).toMatchObject({
      amount: 1000,
      reason: "subscription_payment",
    });
    expect(snapshot.creditActivityPagination).toEqual({ page: 2, pageSize: 10, total: 11, pages: 2 });
    expect(mocks.getCreditActivity).toHaveBeenCalledWith(
      "fc69fd54-552a-49d3-a4c7-84bf174b6c95",
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });
});
