import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  poolQuery: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  pool: { query: mocks.poolQuery },
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

import {
  dispatchEmailNotifications,
  enqueueCourseBuildNotifications,
  enqueueDueLectureReminders,
  enqueueEmailNotification,
  getNotificationPreferences,
  parseNotificationPreferencePatch,
} from "@/lib/notification-outbox";

describe("notification outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges stored choices with opt-in defaults", async () => {
    mocks.query.mockResolvedValue([{ category: "lecture", email_enabled: false }]);
    await expect(getNotificationPreferences("user-id")).resolves.toEqual({
      course: true,
      lecture: false,
      assessment: true,
      transcript: true,
    });
  });

  it("does not let users disable required security or billing notices", () => {
    expect(() => parseNotificationPreferencePatch({ security: false })).toThrow(
      "Unknown or required",
    );
    expect(() => parseNotificationPreferencePatch({ course: "yes" })).toThrow(
      "true or false",
    );
  });

  it("uses a stable opaque event key and lets the database deduplicate it", async () => {
    mocks.queryOne.mockResolvedValueOnce({ id: "outbox-1" }).mockResolvedValueOnce(null);
    const input = {
      userId: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
      eventId: "book:42:plan:3",
      event: { type: "course.ready" as const, courseTitle: "Databases" },
    };

    await expect(enqueueEmailNotification(input)).resolves.toEqual({ queued: true });
    await expect(enqueueEmailNotification(input)).resolves.toEqual({ queued: false });

    const firstKey = mocks.queryOne.mock.calls[0][1][0] as string;
    const secondKey = mocks.queryOne.mock.calls[1][1][0] as string;
    expect(firstKey).toBe(secondKey);
    expect(firstKey).toMatch(/^notification:[a-f0-9]{64}$/);
    expect(firstKey).not.toContain("book:42");
    expect(mocks.queryOne.mock.calls[0][0]).toContain("ON CONFLICT (event_key) DO NOTHING");
  });

  it("claims, sends, and marks a message with provider idempotency", async () => {
    mocks.query.mockResolvedValue([
      {
        id: "a4d9f816-e097-4149-9992-c3eb76a386b1",
        email: "student@example.test",
        subject: "Course ready",
        text_body: "Open your course.",
        attempts: 1,
      },
    ]);
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await expect(
      dispatchEmailNotifications({ workerId: "worker-1" }),
    ).resolves.toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });

    expect(mocks.query.mock.calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "univai/a4d9f816-e097-4149-9992-c3eb76a386b1",
      }),
    );
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("status = 'sent'");
  });

  it("queues one stable reminder for a lecture inside the 24-hour window", async () => {
    mocks.query.mockResolvedValue([
      {
        user_id: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
        public_id: "54e82675-2909-40ef-ab59-3f1cab20838f",
        title: "Index design",
        starts_at: new Date("2026-08-11T10:00:00.000Z"),
      },
    ]);
    mocks.queryOne.mockResolvedValue({ id: "reminder-1" });

    await expect(
      enqueueDueLectureReminders(new Date("2026-08-10T10:00:00.000Z")),
    ).resolves.toBe(1);
    expect(mocks.query.mock.calls[0][0]).toContain("INTERVAL '24 hours'");
    expect(mocks.query.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.queryOne.mock.calls[0][1][3]).toBe("lecture.reminder");
  });

  it("queues stable ready and retry-aware failed course updates", async () => {
    mocks.query.mockResolvedValue([
      {
        user_id: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
        book_id: 42,
        course_title: "Databases",
        status: "ready",
        failed_week: null,
        failed_stage: null,
        failed_attempt: null,
      },
      {
        user_id: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
        book_id: 43,
        course_title: "Networks",
        status: "partial_failed",
        failed_week: 3,
        failed_stage: "slides",
        failed_attempt: 2,
      },
    ]);
    mocks.queryOne.mockResolvedValue({ id: "queued" });

    await expect(enqueueCourseBuildNotifications()).resolves.toBe(2);
    expect(mocks.query.mock.calls[0][0]).toContain("generation_audio_ready_weeks");
    expect(mocks.queryOne.mock.calls[0][1][3]).toBe("course.ready");
    expect(mocks.queryOne.mock.calls[1][1][3]).toBe("course.failed");
  });

  it("backs off failures without saving provider messages or recipient data", async () => {
    mocks.query.mockResolvedValue([
      {
        id: "outbox-2",
        email: "private@example.test",
        subject: "Result",
        text_body: "Private result",
        attempts: 2,
      },
    ]);
    mocks.sendEmail.mockRejectedValue(
      new Error("provider echoed private@example.test and secret=re_should_not_log"),
    );
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await expect(
      dispatchEmailNotifications({ workerId: "worker-2" }),
    ).resolves.toEqual({ claimed: 1, sent: 0, retrying: 1, failed: 0 });

    const retryParams = mocks.poolQuery.mock.calls[0][1] as unknown[];
    expect(retryParams[2]).toBe("pending");
    expect(retryParams[3]).toBe(120);
    expect(retryParams[4]).toBe("Email delivery failed (Error).");
    expect(JSON.stringify(retryParams)).not.toContain("private@example.test");
    expect(JSON.stringify(retryParams)).not.toContain("re_should_not_log");
  });

  it("moves the eighth failed attempt to the terminal failed state", async () => {
    mocks.query.mockResolvedValue([
      { id: "outbox-8", email: "x@y.test", subject: "X", text_body: "Y", attempts: 8 },
    ]);
    mocks.sendEmail.mockRejectedValue(new TypeError("network"));
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await expect(dispatchEmailNotifications({ workerId: "worker-8" })).resolves.toEqual({
      claimed: 1,
      sent: 0,
      retrying: 0,
      failed: 1,
    });
    expect(mocks.poolQuery.mock.calls[0][1][2]).toBe("failed");
  });
});
