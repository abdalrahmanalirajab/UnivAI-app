// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const { fixtureRoot, mockGate, mockGetDocument } = vi.hoisted(() => ({
  fixtureRoot: `${process.cwd()}\\.pdf-reader-test-fixture`,
  mockGate: vi.fn(),
  mockGetDocument: vi.fn(),
}));

vi.mock("@/lib/python", () => ({ REPO_ROOT: fixtureRoot }));
vi.mock("@/lib/session", () => ({ requireUserApi: mockGate }));
vi.mock("@/lib/collections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/collections")>();
  return { ...actual, getDocument: mockGetDocument };
});

import { GET, HEAD } from "@/app/api/documents/[id]/content/route";

const SID = "S-2026-000042";
const PDF = Buffer.from("%PDF-1.7\nreader fixture\n%%EOF", "latin1");
const DOCUMENT = {
  id: 7,
  collection_id: 3,
  student_id: SID,
  filename: "systems.pdf",
  status: "ready" as const,
  error: null,
  created_at: "2026-08-10T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
};

function request(range?: string) {
  return new Request("http://localhost/api/documents/7/content", {
    headers: range ? { Range: range } : undefined,
  });
}

const context = { params: Promise.resolve({ id: "7" }) };

describe("authenticated PDF reader bytes", () => {
  beforeAll(async () => {
    const directory = path.join(
      fixtureRoot,
      "uploads",
      SID,
      "collections",
      "3",
      "7",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, DOCUMENT.filename), PDF);
  });

  afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ registrationNumber: SID });
    mockGetDocument.mockResolvedValue(DOCUMENT);
  });

  it("requires a session before looking up or reading a document", async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it("streams only the signed-in learner's owned PDF with private headers", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
    expect(mockGetDocument).toHaveBeenCalledWith(7, SID);
  });

  it("supports byte ranges used by browser PDF viewers", async () => {
    const response = await GET(request("bytes=0-4"), context);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-4/${PDF.length}`);
    expect(await response.text()).toBe("%PDF-");
  });

  it("supports HEAD without sending PDF bytes", async () => {
    const response = await HEAD(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(PDF.length));
    expect(await response.text()).toBe("");
  });

  it("returns not found for another learner's document without exposing its path", async () => {
    mockGetDocument.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("rejects legacy filenames containing path traversal", async () => {
    mockGetDocument.mockResolvedValue({ ...DOCUMENT, filename: "../../systems.pdf" });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it("rejects invalid or multi-part ranges", async () => {
    const response = await GET(request("bytes=0-1,3-4"), context);
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${PDF.length}`);
  });
});
