import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() => vi.fn(async () => ({ queued: true })));

vi.mock("@/lib/notification-outbox", () => ({ enqueueEmailNotification: enqueue }));

import { queueAuthSecurityNotification } from "@/lib/auth-security-notifications";

describe("auth security notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues password and session alerts only after successful signed-in actions", async () => {
    await queueAuthSecurityNotification({
      path: "/change-password",
      context: { session: { user: { id: "user-1" } }, returned: { status: true } },
    });
    await queueAuthSecurityNotification({
      path: "/revoke-other-sessions",
      context: { session: { user: { id: "user-1" } }, returned: { status: true } },
    });
    await queueAuthSecurityNotification({
      path: "/change-password",
      context: { session: { user: { id: "user-1" } } },
    });

    expect(enqueue).toHaveBeenCalledTimes(2);
    const calls = enqueue.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(calls[0][0]).toMatchObject({
      userId: "user-1",
      event: { type: "security.password_changed" },
    });
    expect(calls[1][0]).toMatchObject({
      userId: "user-1",
      event: { type: "security.sessions_revoked" },
    });
  });
});
