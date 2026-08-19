import { describe, expect, it, vi } from "vitest";

import {
  CREDIT_BALANCE_CHANGED_EVENT,
  formatCreditBalance,
  notifyCreditBalanceChanged,
} from "@/lib/credit-balance-client";

describe("live Credit balance", () => {
  it("keeps small balances exact and compacts larger balances", () => {
    expect(formatCreditBalance(999)).toBe("999");
    expect(formatCreditBalance(1_000)).toBe("1K");
    expect(formatCreditBalance(1_200)).toBe("1.2K");
    expect(formatCreditBalance(1_000_000)).toBe("1M");
  });

  it("announces balance changes to mounted navigation", () => {
    const listener = vi.fn();
    window.addEventListener(CREDIT_BALANCE_CHANGED_EVENT, listener);

    notifyCreditBalanceChanged();

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(CREDIT_BALANCE_CHANGED_EVENT, listener);
  });
});
