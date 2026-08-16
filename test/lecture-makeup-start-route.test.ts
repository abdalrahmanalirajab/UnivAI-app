// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGate, mockRateLimit, mockStart } = vi.hoisted(() => ({
  mockGate: vi.fn(),
  mockRateLimit: vi.fn(),
  mockStart: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireLearningActionApi: mockGate }));
vi.mock("@/lib/rate-limits", () => ({ enforceUserRateLimit: mockRateLimit }));
vi.mock("@/lib/lecture-makeup", () => ({ startLectureMakeup: mockStart }));

import { POST } from "@/app/api/lecture/[id]/makeup/start/route";

const LECTURE_ID = "11111111-1111-4111-8111-111111111111";

function post() {
  return POST(
    new NextRequest(`http://localhost/api/lecture/${LECTURE_ID}/makeup/start`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: LECTURE_ID }) },
  );
}

describe("POST /api/lecture/[id]/makeup/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ id: "user-a", registrationNumber: "S-2026-000001" });
    mockRateLimit.mockResolvedValue(null);
  });

  it("starts only the authenticated learner's approved make-up", async () => {
    mockStart.mockResolvedValue({
      state: "active",
      startedAt: new Date("2026-08-12T14:00:00.000Z"),
      firstJoinCutoffAt: new Date("2026-08-12T14:30:00.000Z"),
    });

    const response = await post();
    expect(response.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith("S-2026-000001", LECTURE_ID);
    expect(await response.json()).toEqual({
      makeup: {
        state: "active",
        startedAt: "2026-08-12T14:00:00.000Z",
        firstJoinCutoffAt: "2026-08-12T14:30:00.000Z",
      },
    });
  });

  it("fails closed when no administrator approved this lecture", async () => {
    mockStart.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(403);
  });

  it("does not restart a completed make-up", async () => {
    mockStart.mockResolvedValue({ state: "completed" });
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "MAKEUP_CLOSED" });
  });
});
