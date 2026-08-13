import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { connect: mocks.connect },
}));

import { getSubscriptionSnapshot } from "@/lib/subscriptions";

describe("subscription wallet snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.release,
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT plan_code")) {
        return {
          rows: [
            {
              plan_code: "free",
              pending_plan_code: null,
              status: "active",
              provider: "none",
              provider_subscription_id: null,
              provider_plan_id: null,
              subscribed_at: null,
              current_period_ends_at: null,
              cancelled_at: null,
              created_at: "2026-08-10T00:00:00.000Z",
              updated_at: "2026-08-10T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("SELECT balance")) {
        return {
          rows: [
            {
              balance: 100,
              weekly_allowance: 100,
              week_started_at: "2026-08-10",
            },
          ],
        };
      }
      if (sql.includes("FROM coin_transactions")) {
        return {
          rows: [
            {
              amount: 100,
              balance_after: 100,
              reason: "signup",
              created_at: "2026-08-10T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  it("does not re-grant the current week in a positive UTC timezone", async () => {
    const snapshot = await getSubscriptionSnapshot(
      "fc69fd54-552a-49d3-a4c7-84bf174b6c95",
      new Date("2026-08-11T12:00:00.000Z"),
    );

    expect(snapshot.coins.balance).toBe(100);
    expect(snapshot.coinTransactions).toEqual([
      {
        amount: 100,
        balanceAfter: 100,
        reason: "signup",
        createdAt: "2026-08-10T00:00:00.000Z",
      },
    ]);
    expect(
      mocks.clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes("SELECT balance"),
      )?.[0],
    ).toContain("week_started_at::text AS week_started_at");
    expect(
      mocks.clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE coin_wallets"),
      ),
    ).toBe(false);
    expect(
      mocks.clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO coin_transactions"),
      ),
    ).toBe(false);
  });
});
