/**
 * "Jump to next lecture start" has to mean the SELECTED learner's next lecture.
 *
 * The clock is global, but timetables are not. The jump searched every
 * student's lectures and landed on whichever one came first, so an admin
 * inspecting learner A could be moved to learner B's lecture with nothing on
 * screen saying so. Observed live: with a learner whose week 1 was 11 Aug
 * selected, the clock jumped to 8 Aug — a different learner's lecture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockQueryOne, mockSetNow, mockNow, mockGate, mockGetOffsetMs } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockSetNow: vi.fn(),
  mockNow: vi.fn(),
  mockGate: vi.fn(),
  mockGetOffsetMs: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ queryOne: mockQueryOne }));
vi.mock("@/lib/session", () => ({ requireAdminApi: mockGate }));
vi.mock("@/lib/clock", () => ({
  now: mockNow,
  setNow: mockSetNow,
  getOffsetMs: mockGetOffsetMs,
  advanceMs: vi.fn(),
  resetClock: vi.fn(),
  MINUTE_MS: 60_000,
  HOUR_MS: 3_600_000,
  DAY_MS: 86_400_000,
  WEEK_MS: 604_800_000,
}));

import { POST } from "@/app/api/clock/route";

const SELECTED = "S-2026-000001";
const THEIR_LECTURE = new Date("2026-08-11T10:00:00.000Z");

function jump(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/clock", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/clock jumpToNextLecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ studentId: "admin", role: "super_admin" });
    mockNow.mockResolvedValue(new Date("2026-08-08T01:00:00.000Z"));
    mockGetOffsetMs.mockResolvedValue(0);
    mockSetNow.mockImplementation(async (value: Date) => value);
    mockQueryOne.mockResolvedValue({ starts_at: THEIR_LECTURE });
  });

  it("lands on the selected student's next lecture, not the earliest anywhere", async () => {
    const response = await jump({ action: "jumpToNextLecture", sid: SELECTED });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      now: THEIR_LECTURE.toISOString(),
    });

    const [sql, params] = mockQueryOne.mock.calls[0];
    expect(sql).toContain("student_id = $1");
    expect(params[0]).toBe(SELECTED);
  });

  it("asks the admin to pick a student rather than guessing", async () => {
    const response = await jump({ action: "jumpToNextLecture" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "STUDENT_REQUIRED" });
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockSetNow).not.toHaveBeenCalled();
  });

  it("says so when that learner has nothing left, instead of moving the clock", async () => {
    mockQueryOne.mockResolvedValue(null);

    const response = await jump({ action: "jumpToNextLecture", sid: SELECTED });

    expect(response.status).toBe(404);
    expect(mockSetNow).not.toHaveBeenCalled();
  });

  it("still refuses a non-admin", async () => {
    mockGate.mockResolvedValue(new Response("no", { status: 403 }));

    const response = await jump({ action: "jumpToNextLecture", sid: SELECTED });

    expect(response.status).toBe(403);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});
