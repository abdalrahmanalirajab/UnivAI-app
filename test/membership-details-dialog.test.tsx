import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";
import CoinBalance from "@/app/components/CoinBalance";

const ACTIVE: SubscriptionSnapshot = {
  planCode: "patron",
  planName: "Patron",
  monthlyPriceUsd: 20,
  weeklyCoins: 1000,
  pendingPlanCode: null,
  status: "active",
  provider: "none",
  providerSubscriptionId: null,
  subscribedAt: "2026-08-11T16:00:00.000Z",
  currentPeriodEndsAt: "2026-09-11T16:00:00.000Z",
  cancelledAt: null,
  createdAt: "2026-08-11T16:00:00.000Z",
  updatedAt: "2026-08-11T16:00:00.000Z",
  coins: {
    balance: 3500,
    weeklyAllowance: 1000,
    weekStartedAt: "2026-08-10",
    nextGrantAt: "2026-08-17T00:00:00.000Z",
  },
  coinTransactions: [
    {
      amount: 100,
      balanceAfter: 100,
      reason: "signup",
      createdAt: "2026-08-11T12:00:00.000Z",
    },
  ],
};

const REVOKED: SubscriptionSnapshot = {
  ...ACTIVE,
  planCode: "free",
  planName: "Free",
  monthlyPriceUsd: 0,
  weeklyCoins: 100,
  status: "cancelled",
  currentPeriodEndsAt: "2026-08-11T17:00:00.000Z",
  cancelledAt: "2026-08-11T17:00:00.000Z",
  updatedAt: "2026-08-11T17:00:00.000Z",
  coins: { ...ACTIVE.coins, weeklyAllowance: 100 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("membership details dialog", () => {
  it("opens from the coin pill, shows activity, and confirms revocation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const subscription = init?.method === "POST" ? REVOKED : ACTIVE;
      return new Response(JSON.stringify({ subscription }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CoinBalance />);

    const trigger = await screen.findByRole("button", {
      name: /Open membership and coin details/,
    });
    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: /Membership/ })).toBeTruthy();
    expect(screen.getByText("Patron")).toBeTruthy();
    expect(screen.getByText("Coin balance")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Coin activity" }));
    expect(await screen.findByText("Welcome grant")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(await screen.findByRole("button", { name: "Revoke membership" }));
    expect(await screen.findByRole("dialog", { name: "Revoke membership?" })).toBeTruthy();
    expect(screen.getByText("Membership payments are final and non-refundable.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Revoke now" }));

    await waitFor(() => expect(screen.getByText("Free")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/subscriptions/paypal/cancel", {
      method: "POST",
    });
  });
});
