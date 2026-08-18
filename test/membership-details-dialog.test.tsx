import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";
import CreditBalance from "@/app/components/CreditBalance";

const ACTIVE: SubscriptionSnapshot = {
  planCode: "patron",
  planName: "Patron",
  monthlyPriceUsd: 20,
  weeklyCredits: 1000,
  pendingPlanCode: null,
  status: "active",
  provider: "none",
  providerSubscriptionId: null,
  subscribedAt: "2026-08-11T16:00:00.000Z",
  currentPeriodEndsAt: "2026-09-11T16:00:00.000Z",
  cancelledAt: null,
  createdAt: "2026-08-11T16:00:00.000Z",
  updatedAt: "2026-08-11T16:00:00.000Z",
  credits: {
    balance: 3500,
    reservedBalance: 0,
    availableBalance: 3500,
    weeklyGrantAmount: 1000,
    nextGrantAt: "2026-08-17T00:00:00.000Z",
  },
  creditActivity: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      amount: 100,
      balanceAfter: 100,
      reason: "signup",
      referenceType: null,
      referenceId: null,
      metadata: {},
      createdAt: "2026-08-11T12:00:00.000Z",
    },
  ],
  creditActivityPagination: { page: 1, pageSize: 10, total: 1, pages: 1 },
};

const REVOKED: SubscriptionSnapshot = {
  ...ACTIVE,
  planCode: "free",
  planName: "Free",
  monthlyPriceUsd: 0,
  weeklyCredits: 100,
  status: "cancelled",
  currentPeriodEndsAt: "2026-08-11T17:00:00.000Z",
  cancelledAt: "2026-08-11T17:00:00.000Z",
  updatedAt: "2026-08-11T17:00:00.000Z",
  credits: { ...ACTIVE.credits, weeklyGrantAmount: 100 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("membership details dialog", () => {
  it("opens from the Credit pill, shows activity, and confirms revocation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const subscription = init?.method === "POST" ? REVOKED : ACTIVE;
      return new Response(JSON.stringify({ subscription }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CreditBalance />);

    const trigger = await screen.findByRole("button", {
      name: /Open membership and Credit details/,
    });
    await user.click(trigger);

    expect(await screen.findByRole("dialog", { name: /Membership/ })).toBeTruthy();
    expect(screen.getByText("Patron")).toBeTruthy();
    expect(screen.getByText("Available Credits")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Credit activity" }));
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
