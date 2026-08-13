import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubscriptionWorkspace from "@/app/subscribe/SubscriptionWorkspace";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

const FREE: SubscriptionSnapshot = {
  planCode: "free",
  planName: "Free",
  monthlyPriceUsd: 0,
  weeklyCoins: 100,
  pendingPlanCode: null,
  status: "active",
  provider: "none",
  providerSubscriptionId: null,
  subscribedAt: null,
  currentPeriodEndsAt: null,
  cancelledAt: null,
  createdAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
  coins: {
    balance: 200,
    weeklyAllowance: 100,
    weekStartedAt: "2026-08-10",
    nextGrantAt: "2026-08-17T00:00:00.000Z",
  },
  coinTransactions: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscription workspace presentation", () => {
  it("keeps policies compact and presents the three plans", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ subscription: FREE }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();

    render(<SubscriptionWorkspace checkoutCancelled={false} />);

    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Supporter" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Patron" })).toBeTruthy();
    expect(screen.queryByText("Review membership before uploading your book")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue to upload" })).toBeTruthy();

    await user.hover(screen.getByRole("button", { name: "Payment policy" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("No refunds")).toBeTruthy();
    expect(within(tooltip).getByText(/Membership payments are final/)).toBeTruthy();
  });
});
