import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserApi: vi.fn(),
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
  enqueueCourses: vi.fn(),
  enqueueReminders: vi.fn(),
  enqueueTranscripts: vi.fn(),
  dispatch: vi.fn(),
  cleanupRateLimits: vi.fn(),
  reconcileFinals: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/notification-outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notification-outbox")>(
    "@/lib/notification-outbox",
  );
  return {
    ...actual,
    getNotificationPreferences: mocks.getPreferences,
    setNotificationPreferences: mocks.setPreferences,
    enqueueCourseBuildNotifications: mocks.enqueueCourses,
    enqueueDueLectureReminders: mocks.enqueueReminders,
    enqueueReleasedTranscriptNotifications: mocks.enqueueTranscripts,
    dispatchEmailNotifications: mocks.dispatch,
  };
});
vi.mock("@/lib/rate-limits", () => ({
  enforceUserRateLimit: vi.fn(async () => null),
  cleanupExpiredRateLimitUsage: mocks.cleanupRateLimits,
}));
vi.mock("@/lib/clock", () => ({ now: vi.fn(async () => new Date("2026-08-10T12:00:00.000Z")) }));
vi.mock("@/lib/final-exam-scheduler", () => ({
  ensureAndReconcileScheduledFinals: mocks.reconcileFinals,
}));
vi.mock("@/lib/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "local-notification-secret-32-characters",
    NOTIFICATION_DISPATCH_SECRET: "",
  },
}));

import { POST as dispatchNotifications } from "@/app/api/notifications/dispatch/route";
import {
  GET as getPreferences,
  PATCH as patchPreferences,
} from "@/app/api/notifications/preferences/route";

describe("notification APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCourses.mockResolvedValue(0);
    mocks.enqueueReminders.mockResolvedValue(0);
    mocks.enqueueTranscripts.mockResolvedValue(0);
    mocks.cleanupRateLimits.mockResolvedValue(0);
    mocks.reconcileFinals.mockResolvedValue([]);
  });

  it("requires authentication for preferences", async () => {
    mocks.requireUserApi.mockResolvedValue(
      Response.json({ error: "Not authenticated." }, { status: 401 }),
    );
    expect((await getPreferences()).status).toBe(401);
  });

  it("updates only the signed-in user's optional categories", async () => {
    mocks.requireUserApi.mockResolvedValue({ id: "user-1" });
    mocks.setPreferences.mockResolvedValue({
      course: false,
      lecture: true,
      assessment: true,
      transcript: true,
    });
    const response = await patchPreferences(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ preferences: { course: false } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setPreferences).toHaveBeenCalledWith("user-1", { course: false });
    await expect(response.json()).resolves.toMatchObject({
      required: { security: true, billing: true },
    });
  });

  it("rejects attempts to turn off security email", async () => {
    mocks.requireUserApi.mockResolvedValue({ id: "user-1" });
    const response = await patchPreferences(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ preferences: { security: false } }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.setPreferences).not.toHaveBeenCalled();
  });

  it("protects the dispatcher with a constant-time bearer secret", async () => {
    const unauthorized = await dispatchNotifications(
      new Request("http://localhost/api/notifications/dispatch", { method: "POST" }),
    );
    expect(unauthorized.status).toBe(401);

    mocks.dispatch.mockResolvedValue({ claimed: 2, sent: 2, retrying: 0, failed: 0 });
    mocks.enqueueCourses.mockResolvedValue(2);
    mocks.enqueueReminders.mockResolvedValue(1);
    const authorized = await dispatchNotifications(
      new Request("http://localhost/api/notifications/dispatch", {
        method: "POST",
        headers: { Authorization: "Bearer local-notification-secret-32-characters" },
      }),
    );
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toEqual({
      courseUpdatesQueued: 2,
      remindersQueued: 1,
      transcriptsQueued: 0,
      finalizedFinals: 0,
      rateLimitRowsCleaned: 0,
      claimed: 2,
      sent: 2,
      retrying: 0,
      failed: 0,
    });
  });
});
