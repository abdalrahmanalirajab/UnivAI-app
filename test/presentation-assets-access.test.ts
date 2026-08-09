// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGate, mockAccess, mockReadFile } = vi.hoisted(() => ({
  mockGate: vi.fn(),
  mockAccess: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireLearningActionApi: mockGate }));
vi.mock("@/lib/lecture-materials", () => ({ getPresentationMaterialAccess: mockAccess }));
vi.mock("@/lib/python", () => ({ REPO_ROOT: "D:\\trusted-univai-root" }));
vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));

import { GET } from "@/app/api/presentation/[id]/[[...asset]]/route";

const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";

function get(asset: string[] = ["1"]) {
  return GET(
    new Request(`http://localhost/api/presentation/${ARTIFACT_ID}/${asset.join("/")}`),
    { params: Promise.resolve({ id: ARTIFACT_ID, asset }) },
  );
}

describe("presentation asset authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ registrationNumber: "S-2026-000042" });
    mockReadFile.mockResolvedValue(Buffer.from("<html>slides</html>"));
  });

  it("checks learner ownership before touching the Slidev cache", async () => {
    mockAccess.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("checks live/end-time access before touching the Slidev cache", async () => {
    mockAccess.mockResolvedValue({
      available: false,
      mode: null,
      blockedReason: "not_started",
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("serves an owned archive after the authorization check", async () => {
    mockAccess.mockResolvedValue({ available: true, mode: "archive", blockedReason: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<html>slides</html>");
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("rejects traversal segments even after authorization", async () => {
    mockAccess.mockResolvedValue({ available: true, mode: "archive", blockedReason: null });
    const response = await get(["..", "secret"]);
    expect(response.status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
