import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getMonitor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/admin-notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-notifications")>(
    "@/lib/admin-notifications",
  );
  return { ...actual, getAdminNotificationMonitor: mocks.getMonitor };
});

import { GET } from "@/app/api/admin/notifications/route";

const safeMonitor = {
  registrationNumber: null,
  summary: { queued: 0, retrying: 0, processing: 0, submitted: 1, failed: 0, skipped: 0 },
  notifications: [{
    id: "delivery-1",
    status: "submitted",
    subject: "Verify your UnivAI email",
    learner: { registrationNumber: "S-2026-000014", name: "Ahmed", email: "a@example.test" },
  }],
  pagination: { page: 1, pageSize: 25, total: 1, pages: 1 },
};

describe("admin notification API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({ id: "admin-1" });
    mocks.getMonitor.mockResolvedValue(safeMonitor);
  });

  it("enforces admin authorization before querying", async () => {
    mocks.requireAdminApi.mockResolvedValue(
      Response.json({ error: "Forbidden." }, { status: 403 }),
    );
    const response = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(response.status).toBe(403);
    expect(mocks.getMonitor).not.toHaveBeenCalled();
  });

  it("uses the global scope by default and never returns body fields", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getMonitor).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
    const body = await response.json();
    expect(body.notifications[0].learner.registrationNumber).toBe("S-2026-000014");
    expect(JSON.stringify(body)).not.toContain("text_body");
    expect(JSON.stringify(body)).not.toContain("reset-token");
  });

  it("accepts a selected SID and rejects malformed scope or filters", async () => {
    const selected = await GET(
      new NextRequest("http://localhost/api/admin/notifications?sid=S-2026-000014&status=sent"),
    );
    expect(selected.status).toBe(200);
    expect(mocks.getMonitor).toHaveBeenCalledWith(
      "S-2026-000014",
      expect.objectContaining({ status: "submitted" }),
    );

    expect((await GET(new NextRequest("http://localhost/api/admin/notifications?sid=bad"))).status)
      .toBe(400);
    expect((await GET(new NextRequest("http://localhost/api/admin/notifications?status=bad"))).status)
      .toBe(400);
  });
});
