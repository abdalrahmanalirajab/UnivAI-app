import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), poolQuery: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  queryOne: mocks.queryOne,
  pool: { query: mocks.poolQuery },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

import { sendMonitoredEmail } from "@/lib/monitored-email";

const input = {
  userId: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
  category: "security" as const,
  eventType: "auth.password_reset",
  to: "private@example.test",
  subject: "Reset your UnivAI password",
  text: "Use https://example.test/reset?token=never-store-this",
};

describe("direct email monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryOne.mockResolvedValue({ id: "4afd0cf8-3ac5-49b9-935f-6f40127d4567" });
    mocks.poolQuery.mockResolvedValue({ rowCount: 1 });
  });

  it("records sent metadata without recipient, body, links, or tokens", async () => {
    const deliver = vi.fn().mockResolvedValue("sent");
    await expect(sendMonitoredEmail(input, deliver)).resolves.toBe("sent");

    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ to: input.to, text: input.text }));
    const insertSql = String(mocks.queryOne.mock.calls[0][0]);
    const insertParams = mocks.queryOne.mock.calls[0][1] as unknown[];
    expect(insertSql).not.toContain("text_body");
    expect(insertSql).not.toContain("recipient");
    expect(insertParams).toEqual([
      input.userId,
      "security",
      "auth.password_reset",
      "Reset your UnivAI password",
    ]);
    expect(JSON.stringify(insertParams)).not.toContain("private@example.test");
    expect(JSON.stringify(insertParams)).not.toContain("never-store-this");
    expect(mocks.poolQuery.mock.calls[0][1]).toEqual([
      "4afd0cf8-3ac5-49b9-935f-6f40127d4567",
      "sent",
    ]);
  });

  it("records an intentionally skipped development delivery", async () => {
    const deliver = vi.fn().mockResolvedValue("skipped");
    await expect(sendMonitoredEmail(input, deliver)).resolves.toBe("skipped");
    expect(mocks.poolQuery.mock.calls[0][1][1]).toBe("skipped");
    expect(mocks.poolQuery.mock.calls[0][0]).toContain("CASE WHEN $2 = 'sent' THEN 1 ELSE 0 END");
  });

  it("records only a safe failure label and rethrows the delivery failure", async () => {
    const deliver = vi.fn().mockRejectedValue(
      new Error("private@example.test token=never-store-this"),
    );
    await expect(sendMonitoredEmail(input, deliver)).rejects.toThrow("never-store-this");

    const failureParams = mocks.poolQuery.mock.calls[0][1] as unknown[];
    expect(failureParams[1]).toBe("Email delivery failed (Error).");
    expect(JSON.stringify(failureParams)).not.toContain("private@example.test");
    expect(JSON.stringify(failureParams)).not.toContain("never-store-this");
  });

  it("never makes a completed auth email fail because monitoring update failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.poolQuery.mockRejectedValue(new Error("monitor unavailable"));
    const deliver = vi.fn().mockResolvedValue("sent");

    await expect(sendMonitoredEmail(input, deliver)).resolves.toBe("sent");
    expect(console.error).toHaveBeenCalledWith(
      "[notifications] could not update direct email delivery metadata.",
    );
  });
});
