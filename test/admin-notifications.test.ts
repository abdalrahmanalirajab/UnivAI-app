import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: mocks.query, queryOne: mocks.queryOne }));

import {
  getAdminNotificationMonitor,
  parseAdminNotificationFilters,
} from "@/lib/admin-notifications";

const deliveryRow = {
  id: "delivery-1",
  delivery_source: "outbox" as const,
  delivery_status: "sent",
  category: "assessment",
  event_type: "assessment.result",
  subject: "Your assessment result",
  attempts: 1,
  safe_error: "provider echoed student@example.test token=secret",
  created_at: "2026-08-11T10:00:00.000Z",
  updated_at: "2026-08-11T10:01:00.000Z",
  available_at: null,
  processing_started_at: null,
  sent_at: "2026-08-11T10:01:00.000Z",
  learner_sid: "S-2026-000014",
  learner_name: "Ahmed",
  learner_email: "student@example.test",
};

describe("admin notification monitoring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates bounded filters", () => {
    expect(parseAdminNotificationFilters(new URLSearchParams("status=sent&page=2&pageSize=50")))
      .toMatchObject({ status: "sent", page: 2, pageSize: 50 });
    expect(() => parseAdminNotificationFilters(new URLSearchParams("status=unknown")))
      .toThrow("Unknown notification status");
    expect(() => parseAdminNotificationFilters(new URLSearchParams("event=reset token")))
      .toThrow("Invalid notification event");
  });

  it("defaults to a global feed with learner identity and no message bodies", async () => {
    mocks.query
      .mockResolvedValueOnce([deliveryRow])
      .mockResolvedValueOnce([{ delivery_status: "sent", count: "1" }]);
    mocks.queryOne.mockResolvedValueOnce({ total: "1" });

    const result = await getAdminNotificationMonitor(null, {
      page: 1,
      pageSize: 25,
    });

    expect(result).toMatchObject({
      registrationNumber: null,
      summary: { sent: 1 },
      notifications: [{
        subject: "Your assessment result",
        error: "Email delivery failed.",
        learner: {
          registrationNumber: "S-2026-000014",
          name: "Ahmed",
          email: "student@example.test",
        },
      }],
      pagination: { total: 1 },
    });
    expect(mocks.queryOne).toHaveBeenCalledTimes(1);

    const listSql = String(mocks.query.mock.calls[0][0]);
    expect(listSql).toContain("notification_email_outbox");
    expect(listSql).toContain("notification_email_delivery_log");
    expect(listSql).not.toContain("text_body");
    expect(listSql).not.toContain("event_key");
    expect(listSql).not.toContain("locked_by");
    expect(JSON.stringify(result)).not.toContain("token=secret");
  });

  it("scopes rows, totals, and summaries to the selected learner", async () => {
    mocks.queryOne
      .mockResolvedValueOnce({ id: "user-1" })
      .mockResolvedValueOnce({ total: "1" });
    mocks.query
      .mockResolvedValueOnce([deliveryRow])
      .mockResolvedValueOnce([{ delivery_status: "sent", count: "1" }]);

    const result = await getAdminNotificationMonitor("S-2026-000014", {
      category: "assessment",
      page: 1,
      pageSize: 25,
    });

    expect(result?.registrationNumber).toBe("S-2026-000014");
    expect(mocks.queryOne.mock.calls[0][0]).toContain('"registrationNumber" = $1');
    expect(mocks.query.mock.calls[0][1]).toEqual(["S-2026-000014", "assessment", 25, 0]);
    expect(mocks.queryOne.mock.calls[1][1]).toEqual(["S-2026-000014", "assessment"]);
    expect(mocks.query.mock.calls[1][1]).toEqual(["S-2026-000014", "assessment"]);
  });
});
