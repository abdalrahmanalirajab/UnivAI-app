import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limits", () => ({ enforceUserRateLimit: vi.fn(async () => null) }));

const { mockCreateRetryVersion, mockMarkRetryFailed, mockSpawnGeneration, mockGate } = vi.hoisted(() => ({
  mockCreateRetryVersion: vi.fn(),
  mockMarkRetryFailed: vi.fn(),
  mockSpawnGeneration: vi.fn(),
  mockGate: vi.fn(),
}));

vi.mock("@/lib/feedback", () => ({
  createRetryVersion: mockCreateRetryVersion,
  markRetryFailed: mockMarkRetryFailed,
}));
vi.mock("@/lib/generation", () => ({ spawnGeneration: mockSpawnGeneration }));
vi.mock("@/lib/python", () => ({ REPO_ROOT: "/repo" }));
vi.mock("@/lib/session", () => ({ requirePreparedSourceApi: mockGate }));

import { POST } from "@/app/api/outputs/[outputId]/retry/route";

const STUDENT_ID = "S-2026-000001";
const OUTPUT = {
  id: 8,
  source_qa_id: 3,
  output_version: "2",
  trace_id: "trace-retry-2",
  book_id: 42,
  status: "generating",
  citations: [],
  created_at: "2026-08-02T00:00:00.000Z",
};

function post(outputId = "7") {
  return POST(new NextRequest(`http://localhost/api/outputs/${outputId}/retry`, { method: "POST" }), {
    params: Promise.resolve({ outputId }),
  });
}

describe("POST /api/outputs/[outputId]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ registrationNumber: STUDENT_ID });
    mockCreateRetryVersion.mockResolvedValue({
      ok: true,
      output: OUTPUT,
      filename: "ai-textbook.pdf",
    });
  });

  it("returns the newly persisted version and starts generation for its book", async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ output: OUTPUT });
    expect(mockCreateRetryVersion).toHaveBeenCalledWith(STUDENT_ID, 7);
    expect(mockSpawnGeneration).toHaveBeenCalledWith(
      path.join("/repo", "uploads", STUDENT_ID, "ai-textbook.pdf"),
      42,
      "full",
    );
  });

  it("preserves helper conflicts and does not start another generator", async () => {
    mockCreateRetryVersion.mockResolvedValue({
      ok: false,
      error: "A build is already running — wait for it to finish.",
      status: 409,
    });
    const response = await post();
    expect(response.status).toBe(409);
    expect(mockSpawnGeneration).not.toHaveBeenCalled();
  });

  it("marks the new version failed when the generator cannot start", async () => {
    mockSpawnGeneration.mockImplementation(() => {
      throw new Error("generator unavailable");
    });
    const response = await post();
    expect(response.status).toBe(500);
    expect(mockMarkRetryFailed).toHaveBeenCalledWith(STUDENT_ID, OUTPUT.id, "generator unavailable");
  });

  it("rejects malformed output ids before touching persistence", async () => {
    const response = await post("not-a-number");
    expect(response.status).toBe(400);
    expect(mockCreateRetryVersion).not.toHaveBeenCalled();
  });

  it("passes through authentication failures", async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await post();
    expect(response.status).toBe(401);
    expect(mockCreateRetryVersion).not.toHaveBeenCalled();
  });
});
