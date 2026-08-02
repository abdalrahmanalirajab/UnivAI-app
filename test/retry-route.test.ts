import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockQueryOne, mockQuery, mockSpawnGeneration, mockGate } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockQuery: vi.fn(),
  mockSpawnGeneration: vi.fn(),
  mockGate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  queryOne: mockQueryOne,
  query: mockQuery,
}));
vi.mock("@/lib/generation", () => ({
  spawnGeneration: mockSpawnGeneration,
}));
vi.mock("@/lib/python", () => ({
  REPO_ROOT: "/repo",
}));
vi.mock("@/lib/session", () => ({
  requirePreparedSourceApi: mockGate,
}));

import { POST } from "@/app/api/retry/route";

const STUDENT_ID = "S-2026-000001";
const BOOK = { id: 42, filename: "ai-textbook.pdf", status: "failed" };
const PROGRESS_TEXT = "Retrying the generation — re-running lectures, quizzes and voice…";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sqlCalls(): string[] {
  return mockQuery.mock.calls.map((call) => String(call[0]));
}

describe("POST /api/retry — task 3f checklist at the route level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ studentId: STUDENT_ID });
    mockQueryOne.mockResolvedValue(BOOK);
    mockQuery.mockResolvedValue(undefined);
  });

  it("records nothing over the old version: the only write is the single books status UPDATE", async () => {
    const res = await POST(post({ bookId: 42 }));

    // Checklist 5 (nothing overwritten/deleted): the entire write set is one
    // UPDATE on books — no INSERT/DELETE, and no write to qa_log or feedback
    // (the tables that hold prior output versions).
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = sqlCalls()[0];
    expect(sql).toContain("UPDATE books");
    expect(sql).toContain("SET status = 'generating'");
    expect(sql).not.toMatch(/INSERT|DELETE/i);
    expect(sql).not.toMatch(/qa_log|feedback/i);
    expect(mockQuery.mock.calls[0][1]).toEqual([PROGRESS_TEXT, 42]);

    // The old rows stay retrievable: their content is never touched by retry.
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("SELECT");
    expect(String(mockQueryOne.mock.calls[0][0])).toContain(
      "WHERE id = $1 AND student_id = $2",
    );
    expect(mockQueryOne.mock.calls[0][1]).toEqual([42, STUDENT_ID]);

    expect(res.status).toBe(200);
  });

  it("re-spawns generation against the real book identity", async () => {
    await POST(post({ bookId: 42 }));

    // Checklist 4 (new output associated with the new run): the new generation
    // is attached to the only real identity that version records can key on —
    // the owning student's upload and the book id.
    expect(mockSpawnGeneration).toHaveBeenCalledTimes(1);
    expect(mockSpawnGeneration).toHaveBeenCalledWith(
      "/repo/uploads/S-2026-000001/ai-textbook.pdf",
      42,
      false,
    );
  });

  it("returns real book state only and mints no version tokens", async () => {
    const res = await POST(post({ bookId: 42 }));
    const body = await res.json();

    // Checklist 2 (new version exists and differs): unsatisfiable by design —
    // no version storage exists (docs/proposed-output-versions-ddl.md), so the
    // route must not CLAIM a version either. Pin the honest contract so a
    // fabricated version token fails this test.
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, bookId: 42, status: "generating" });
    expect(Object.keys(body).sort()).toEqual(["bookId", "ok", "status"]);
  });

  it("409 conflict: a build already running means zero writes", async () => {
    mockQueryOne.mockResolvedValue({ ...BOOK, status: "generating" });

    const res = await POST(post({ bookId: 42 }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "A build is already running — wait for it to finish.",
    });
    // Nothing overwritten, nothing deleted, nothing even queued.
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSpawnGeneration).not.toHaveBeenCalled();
  });

  it("404: a book that is not the student's is rejected with no writes", async () => {
    mockQueryOne.mockResolvedValue(null);

    const res = await POST(post({ bookId: 42 }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such book." });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSpawnGeneration).not.toHaveBeenCalled();
  });

  it("400: a malformed body never reaches the database", async () => {
    const res = await POST(post({ bookId: "forty-two" }));

    expect(res.status).toBe(400);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSpawnGeneration).not.toHaveBeenCalled();
  });

  it("passes through the session gate rejection without any db work", async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));

    const res = await POST(post({ bookId: 42 }));

    expect(res.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSpawnGeneration).not.toHaveBeenCalled();
  });
});
