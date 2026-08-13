// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  now: vi.fn(),
  getOffsetMs: vi.fn(),
  getAttendance: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/db", () => ({ query: mocks.query, queryOne: mocks.queryOne }));
vi.mock("@/lib/clock", () => ({ now: mocks.now, getOffsetMs: mocks.getOffsetMs }));
vi.mock("@/lib/attendance", () => ({
  getAttendance: mocks.getAttendance,
  summarize: () => ({ onTimeCount: 0, lateCount: 0, absentCount: 0 }),
}));

const ADMIN = {
  id: "55cbe793-8a4b-4518-88ea-25b43f19e24a",
  email: "admin@univai.test",
  role: "admin",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminApi.mockResolvedValue(ADMIN);
  mocks.now.mockResolvedValue(new Date("2026-08-12T12:00:00.000Z"));
  mocks.getOffsetMs.mockResolvedValue(0);
  mocks.getAttendance.mockResolvedValue([]);
});

describe("bounded admin learner access", () => {
  it("caps page size and clamps an excessive page before querying rows", async () => {
    mocks.queryOne.mockResolvedValue({ total: 75 });
    mocks.query.mockResolvedValue([]);
    const { GET } = await import("@/app/api/admin/learners/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/learners?page=999999&pageSize=500"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ page: 2, pageSize: 50, total: 75, pages: 2 });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT $1 OFFSET $2"),
      [50, 50],
    );
  });

  it("does not enumerate users from the frequently-polled state endpoint", async () => {
    const { GET } = await import("@/app/api/admin/state/route");
    const response = await GET(new NextRequest("http://localhost/api/admin/state"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ needsStudent: true });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });
});

describe("privacy request administration", () => {
  it("requires identity verification before a request can be completed", async () => {
    const { PATCH } = await import("@/app/api/admin/privacy-requests/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/privacy-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "6a9a738f-0df7-4c96-a28d-e381ad8638c7",
          status: "completed",
          adminNote: "Export delivered to the verified learner.",
          identityVerified: false,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });

  it("updates and audit-logs a verified workflow decision atomically", async () => {
    mocks.queryOne.mockResolvedValue({ id: "6a9a738f-0df7-4c96-a28d-e381ad8638c7" });
    const { PATCH } = await import("@/app/api/admin/privacy-requests/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/privacy-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "6a9a738f-0df7-4c96-a28d-e381ad8638c7",
          status: "completed",
          adminNote: "Export delivered to the verified learner.",
          identityVerified: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.queryOne.mock.calls[0][0]).toContain("INSERT INTO auth_audit");
    expect(mocks.queryOne.mock.calls[0][0]).toContain("review-privacy-request");
    expect(mocks.queryOne.mock.calls[0][1]).toEqual([
      "6a9a738f-0df7-4c96-a28d-e381ad8638c7",
      "completed",
      "Export delivered to the verified learner.",
      true,
      ADMIN.id,
      ADMIN.email,
    ]);
  });
});
