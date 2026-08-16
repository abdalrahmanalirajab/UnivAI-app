// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGate, mockAccess, mockReadSlides } = vi.hoisted(() => ({
  mockGate: vi.fn(),
  mockAccess: vi.fn(),
  mockReadSlides: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireLearningActionApi: mockGate }));
vi.mock("@/lib/lecture-materials", () => ({ getLectureMaterialAccess: mockAccess }));
vi.mock("@/lib/lectures", () => ({ readSlides: mockReadSlides }));

import { GET } from "@/app/api/lecture/[id]/slides/route";

const LECTURE_ID = "11111111-1111-4111-8111-111111111111";
const DECK = {
  presentationId: "22222222-2222-4222-8222-222222222222",
  week: 1,
  title: "Storage engines",
  slides: [{ slide: 1, heading: "Indexes", bullets: [], page: 5 }],
};

function get(mode?: "archive") {
  const suffix = mode ? `?mode=${mode}` : "";
  return GET(
    new Request(`http://localhost/api/lecture/${LECTURE_ID}/slides${suffix}`),
    { params: Promise.resolve({ id: LECTURE_ID }) },
  );
}

describe("GET /api/lecture/[id]/slides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ registrationNumber: "S-2026-000042" });
    mockReadSlides.mockResolvedValue(DECK);
  });

  it("does not reveal a lecture owned by someone else", async () => {
    mockAccess.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(mockReadSlides).not.toHaveBeenCalled();
  });

  it("does not expose slides during a live lecture without a recorded join", async () => {
    mockAccess.mockResolvedValue({
      available: false,
      mode: null,
      blockedReason: "not_joined",
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "PRESENTATION_LOCKED",
      reason: "not_joined",
    });
    expect(mockReadSlides).not.toHaveBeenCalled();
  });

  it("does not let the archive query bypass the scheduled end", async () => {
    mockAccess.mockResolvedValue({ available: true, mode: "live", blockedReason: null });
    const response = await get("archive");
    expect(response.status).toBe(403);
    expect(mockReadSlides).not.toHaveBeenCalled();
  });

  it("returns the read-only archive metadata after the lecture ends", async () => {
    mockAccess.mockResolvedValue({ available: true, mode: "archive", blockedReason: null });
    const response = await get("archive");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deck: DECK, mode: "archive" });
  });
});
