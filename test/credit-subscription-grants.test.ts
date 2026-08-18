import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("@/lib/db", () => ({ pool: {} }));

import { grantSubscriptionPaymentWithClient } from "@/lib/credits";

describe("additive subscription Credit grants", () => {
  it("adds every complete paid-plan amount and deduplicates only the same payment", async () => {
    let balance = 100;
    const ledger = new Map<string, number>();
    const grantedAmounts: number[] = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("catch_up_credit_grants")) return { rows: [{ amount: 0 }] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}] };
      if (sql.includes("SELECT balance_after FROM credit_transactions")) {
        const balanceAfter = ledger.get(String(params[0]));
        return { rows: balanceAfter === undefined ? [] : [{ balance_after: balanceAfter }] };
      }
      if (sql.includes("UPDATE credit_wallets") && sql.includes("balance = balance + $2")) {
        const amount = Number(params[1]);
        grantedAmounts.push(amount);
        balance += amount;
        return { rows: [{ balance }] };
      }
      if (sql.includes("INSERT INTO credit_transactions") && params.length >= 4) {
        ledger.set(String(params[3]), Number(params[2]));
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const client = { query } as unknown as PoolClient;

    const grants = [
      { planCode: "patron", amount: 1_000, paymentId: "pay-1" },
      { planCode: "supporter", amount: 300, paymentId: "pay-2" },
      { planCode: "patron", amount: 1_000, paymentId: "pay-3" },
    ] as const;
    const balances: number[] = [];
    for (const grant of grants) {
      const result = await grantSubscriptionPaymentWithClient(client, {
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        provider: "paypal",
        paidAt: new Date("2026-08-18T12:00:00.000Z"),
        ...grant,
      });
      balances.push(result.balance);
    }

    expect(grantedAmounts).toEqual([1_000, 300, 1_000]);
    expect(balances).toEqual([1_100, 1_400, 2_400]);

    const duplicate = await grantSubscriptionPaymentWithClient(client, {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      provider: "paypal",
      planCode: "patron",
      amount: 1_000,
      paymentId: "pay-3",
      paidAt: new Date("2026-08-18T12:00:00.000Z"),
    });
    expect(duplicate).toEqual({ granted: false, balance: 2_400 });
    expect(grantedAmounts).toEqual([1_000, 300, 1_000]);
  });
});
