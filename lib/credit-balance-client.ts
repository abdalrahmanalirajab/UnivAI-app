export const CREDIT_BALANCE_CHANGED_EVENT = "univai:credit-balance-changed";

const EXACT_CREDIT_FORMATTER = new Intl.NumberFormat("en-US");
const COMPACT_CREDIT_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCreditBalance(value: number): string {
  const balance = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return balance < 1_000
    ? EXACT_CREDIT_FORMATTER.format(balance)
    : COMPACT_CREDIT_FORMATTER.format(balance);
}

export function notifyCreditBalanceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CREDIT_BALANCE_CHANGED_EVENT));
  }
}
