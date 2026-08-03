import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { File as NodeFile } from "buffer";
import MultiBookUploader from "@/app/library/MultiBookUploader";
import SourceLibrary from "@/app/library/SourceLibrary";

/* ------------------------------------------------------------------ */
/*  Mock db for programme plan tests (hoisted — vitest runs this first)*/
/* ------------------------------------------------------------------ */

const { mockQueryOne, mockQuery } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  queryOne: mockQueryOne,
  query: mockQuery,
}));

/* ------------------------------------------------------------------ */
/*  Mocks for route-level tests (Phases 1-3 server logic)              */
/* ------------------------------------------------------------------ */

const SID = "S-2026-000001";
const OTHER_SID = "S-2026-000002";

const { mockRequireUserApi, mockRunPython, mockSpawnGeneration } = vi.hoisted(() => ({
  mockRequireUserApi: vi.fn(),
  mockRunPython: vi.fn(),
  mockSpawnGeneration: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mockRequireUserApi }));
vi.mock("@/lib/python", () => ({
  runPython: mockRunPython,
  parseJsonLine: (stdout: string) => {
    try {
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  },
  REPO_ROOT: "/tmp/opencode/univai-test-uploads",
}));
vi.mock("@/lib/generation", () => ({ spawnGeneration: mockSpawnGeneration }));
vi.mock("@/lib/runtime", () => ({ isStandalone: () => false }));
vi.mock("@/lib/env", () => ({ env: { RAG_MCP_URL: "http://rag.test.local" } }));

/* ------------------------------------------------------------------ */
/*  Stateful fake db for route-level tests                             */
/* ------------------------------------------------------------------ */

type FakeRow = Record<string, unknown>;

type FakeDb = {
  queryOne: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  books: FakeRow[];
  collections: FakeRow[];
  documents: FakeRow[];
  programmes: FakeRow[];
};

function seedCollection(db: FakeDb, id: number, studentId: string, name: string) {
  db.collections.push({ id, student_id: studentId, name, created_at: "2026-07-01T00:00:00Z" });
}

function seedDocument(db: FakeDb, id: number, collectionId: number, studentId: string, filename: string, status: string, error: string | null = null) {
  db.documents.push({
    id,
    collection_id: collectionId,
    student_id: studentId,
    filename,
    status,
    error,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  });
}

function seedApprovedProgrammeReferencing(db: FakeDb, collectionId: number, documentId: number) {
  db.programmes.push({
    id: 1,
    student_id: SID,
    collection_id: collectionId,
    status: "approved",
    plan_version: 3,
    plan: {
      semesters: [],
      courses: [],
      prerequisites: [],
      workload: { weeks_per_semester: 4 },
      source_coverage: [{ document_id: documentId, filename: "b.pdf", course_ids: ["c1"], pages: [1] }],
    },
    approved_at: "2026-07-28T00:00:00Z",
  });
}

function createDbFake(): FakeDb {
  const db: FakeDb = {
    queryOne: vi.fn(),
    query: vi.fn(),
    books: [],
    collections: [],
    documents: [],
    programmes: [],
  };
  let seq = 1;

  db.queryOne.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("SELECT offset_ms FROM clock_state")) return null;

    if (sql.includes("pg_advisory_xact_lock") && sql.includes("INSERT INTO collections")) {
      const existing = db.collections.find((c) => c.student_id === params[0]);
      if (existing) return { ...existing, created: false };
      const row = {
        id: seq++,
        student_id: params[0],
        name: params[1],
        created_at: "2026-07-28T00:00:00Z",
      };
      db.collections.push(row);
      return { ...row, created: true };
    }

    if (sql.includes("INSERT INTO books") && sql.includes("RETURNING id")) {
      const row = {
        id: seq++,
        student_id: params[0],
        filename: params[1],
        title: null,
        pages: 0,
        status: "ingesting",
        error: null,
        progress: "Preparing your book…",
        uploaded_at: params[2],
      };
      db.books.push(row);
      return { id: row.id };
    }

    if (sql.includes("INSERT INTO collections") && sql.includes("RETURNING")) {
      const row = { id: seq++, student_id: params[0], name: params[1], created_at: "2026-07-28T00:00:00Z" };
      db.collections.push(row);
      return row;
    }

    if (sql.includes("INSERT INTO documents") && sql.includes("RETURNING")) {
      const row = {
        id: seq++,
        collection_id: params[0],
        student_id: params[1],
        filename: params[2],
        status: "pending",
        error: null,
        created_at: "2026-07-28T00:00:00Z",
        updated_at: "2026-07-28T00:00:00Z",
      };
      db.documents.push(row);
      return row;
    }

    if (sql.includes("UPDATE documents SET status = 'pending'") && sql.includes("status = 'failed'")) {
      const row = db.documents.find(
        (d) => d.id === params[0] && d.student_id === params[1] && d.status === "failed",
      );
      if (row) {
        row.status = "pending";
        row.error = null;
        return row;
      }
      return null;
    }

    if (sql.includes("UPDATE documents SET status = 'uploading'")) {
      const row = db.documents.find(
        (d) =>
          d.id === params[0] &&
          d.student_id === params[1] &&
          ["pending", "failed"].includes(String(d.status)),
      );
      if (!row) return null;
      row.status = "uploading";
      row.error = null;
      row.updated_at = "2026-07-28T00:01:00Z";
      return row;
    }

    if (sql.includes("UPDATE documents SET status = $1")) {
      const row = db.documents.find(
        (d) => d.id === params[2] && d.student_id === params[3],
      );
      if (!row) return null;
      row.status = params[0];
      row.error = params[1];
      row.updated_at = "2026-07-28T00:02:00Z";
      return row;
    }

    if (sql.includes("WITH deleted_books AS") && sql.includes("deleted_document")) {
      db.books = db.books.filter(
        (b) => !(b.student_id === params[0] && b.filename === params[1]),
      );
      const index = db.documents.findIndex(
        (d) => d.id === params[2] && d.student_id === params[0],
      );
      if (index === -1) return null;
      const [removed] = db.documents.splice(index, 1);
      return { id: removed.id };
    }

    if (sql.includes("FROM collections WHERE id = $1 AND student_id = $2")) {
      return db.collections.find((c) => c.id === params[0] && c.student_id === params[1]) ?? null;
    }

    if (sql.includes("SELECT id FROM collections WHERE id = $1")) {
      return db.collections.find((c) => c.id === params[0]) ?? null;
    }

    if (sql.includes("FROM collections") && sql.includes("LIMIT 1")) {
      return db.collections.find((c) => c.student_id === params[0]) ?? null;
    }

    if (sql.includes("FROM books") && sql.includes("WHERE id = $1")) {
      return (
        db.books.find(
          (b) =>
            b.id === params[0] &&
            (params.length < 2 || b.student_id === params[1]) &&
            (params.length < 3 || b.filename === params[2]),
        ) ?? null
      );
    }

    if (sql.includes("FROM books") && sql.includes("filename = $2") && sql.includes("LIMIT 1")) {
      return (
        db.books.find((b) => b.student_id === params[0] && b.filename === params[1]) ?? null
      );
    }

    if (sql.includes("FROM documents WHERE id = $1 AND student_id = $2")) {
      return db.documents.find((d) => d.id === params[0] && d.student_id === params[1]) ?? null;
    }

    if (sql.includes("FROM programmes") && sql.includes("source_coverage")) {
      const row = db.programmes.find((p) => {
        if (p.student_id !== params[0] || p.status !== "approved" || p.collection_id !== params[1]) return false;
        const coverage = (p.plan as { source_coverage?: Array<{ document_id: unknown }> }).source_coverage ?? [];
        return coverage.some((s) => Number(s.document_id) === Number(params[2]));
      });
      return row ?? null;
    }

    if (sql.includes("FROM books") && sql.includes("status IN")) {
      return (
        db.books.find(
          (b) => b.student_id === params[0] && ["ingesting", "generating"].includes(String(b.status)),
        ) ?? null
      );
    }

    throw new Error(`Unhandled queryOne SQL in test fake: ${sql}`);
  });

  db.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("UPDATE books SET status = 'failed'")) {
      const row = db.books.find((b) => b.id === params[1]);
      if (row) {
        row.status = "failed";
        row.error = params[0];
        row.progress = null;
      }
      return row ? [row] : [];
    }

    if (sql.includes("UPDATE books SET status = 'generating'")) {
      const row = db.books.find((b) => b.id === params[1]);
      if (row) {
        row.status = "generating";
        row.title = params[0];
        row.progress = "Preparing your four-week course…";
      }
      return row ? [row] : [];
    }

    if (sql.includes("UPDATE books SET status = 'ingesting'")) {
      const row = db.books.find((b) => b.id === params[0] && b.student_id === params[1]);
      if (row) {
        row.status = "ingesting";
        row.error = null;
        row.progress = "Preparing your book…";
      }
      return row ? [row] : [];
    }

    if (sql.includes("DELETE FROM documents") && sql.includes("RETURNING id")) {
      const index = db.documents.findIndex((d) => d.id === params[0] && d.student_id === params[1]);
      if (index === -1) return [];
      const [row] = db.documents.splice(index, 1);
      return [{ id: row.id }];
    }

    if (sql.includes("FROM books WHERE student_id = $1") && sql.includes("ORDER BY id DESC")) {
      return db.books.filter((b) => b.student_id === params[0]).sort((a, b) => Number(b.id) - Number(a.id));
    }

    if (sql.includes("FROM collections WHERE student_id = $1") && sql.includes("ORDER BY created_at DESC")) {
      return db.collections.filter((c) => c.student_id === params[0]);
    }

    if (sql.includes("FROM documents WHERE collection_id = $1 AND student_id = $2")) {
      return db.documents.filter((d) => d.collection_id === params[0] && d.student_id === params[1]);
    }

    throw new Error(`Unhandled query SQL in test fake: ${sql}`);
  });

  return db;
}

function pdfFile(name: string): NodeFile {
  return new NodeFile([`%PDF-1.4\n${name} content`], name, { type: "application/pdf" });
}

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init);
}

function postForm(
  file: NodeFile | null,
  metadata: Record<string, string> = {},
  url = "http://localhost/api/upload",
): NextRequest {
  const req = new NextRequest(url, { method: "POST" });
  vi.spyOn(req, "formData").mockResolvedValue({
    get: (key: string) => (key === "file" ? file : metadata[key] ?? null),
  } as unknown as FormData);
  return req;
}

function useFakeDb(db: FakeDb) {
  mockQueryOne.mockImplementation(db.queryOne as (...args: unknown[]) => Promise<unknown>);
  mockQuery.mockImplementation(db.query as (...args: unknown[]) => Promise<unknown>);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeProgramme(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    student_id: "S-2026-000001",
    collection_id: 1,
    name: "Test Programme",
    status: "proposed",
    plan_version: 2,
    plan: {
      semesters: [],
      courses: [],
      prerequisites: [],
      workload: { total_credits: 0, total_lecture_hours: 0, total_tutorial_hours: 0, total_lab_hours: 0, weeks_per_semester: 0 },
      source_coverage: [],
    },
    approved_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Test 1: one failed upload doesn't hide/block successful ones       */
/* ------------------------------------------------------------------ */

describe("MultiBookUploader — independent upload statuses", () => {
  beforeEach(() => {
    let callIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const i = callIdx++;
      if (i === 0) {
        return { ok: true, status: 201, json: async () => ({ document: { id: 1, filename: "a.pdf" } }) };
      }
      if (i === 1) {
        return { ok: false, status: 400, json: async () => ({ error: "File too large." }) };
      }
      return { ok: true, status: 201, json: async () => ({ document: { id: 3, filename: "c.pdf" } }) };
    });
  });

  it("marks each file independently: success, failure, success", async () => {
    const user = userEvent.setup();
    const onDocumentsChange = vi.fn();

    render(<MultiBookUploader collectionId={1} onDocumentsChange={onDocumentsChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLElement;
    expect(input).not.toBeNull();

    const fileA = new File(["content-a"], "a.pdf", { type: "application/pdf" });
    const fileB = new File(["content-b"], "b.pdf", { type: "application/pdf" });
    const fileC = new File(["content-c"], "c.pdf", { type: "application/pdf" });

    await user.upload(input, [fileA, fileB, fileC]);

    await waitFor(() => {
      expect(screen.getByText("a.pdf")).toBeTruthy();
      expect(screen.getByText("c.pdf")).toBeTruthy();
    });

    const uploadChips = screen.queryAllByText("Uploaded");
    const failedChips = screen.queryAllByText("Failed");

    expect(uploadChips.length).toBeGreaterThanOrEqual(2);
    expect(failedChips.length).toBe(1);
    expect(onDocumentsChange).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 2: stale plan_version rejection (3f=update, 3e=approve)      */
/* ------------------------------------------------------------------ */

describe("Programme plan version — stale rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("3f — updateProgrammePlan", () => {
    it("rejects edit when plan_version !== expectedVersion", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2 }));

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme().plan, 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
        expect(result.current?.plan_version).toBe(2);
      }
    });

    it("rejects edit when concurrent UPDATE returns no rows", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2 }))
        .mockResolvedValueOnce(null);

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme({ plan_version: 2 }).plan, 2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
      }
    });

    it("accepts edit when plan_version matches and UPDATE succeeds", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2 }))
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 3 }));

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme({ plan_version: 2 }).plan, 2);

      expect(result.ok).toBe(true);
    });

    it("rejects edits after approval", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(
        fakeProgramme({ plan_version: 2, status: "approved" }),
      );

      const result = await updateProgrammePlan(
        1,
        "S-2026-000001",
        fakeProgramme().plan,
        2,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Programme is already approved.");
      }
    });
  });

  describe("3e — approveProgramme", () => {
    it("rejects approval when plan_version does not match", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2 }));

      const result = await approveProgramme(1, "S-2026-000001", 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
        expect(result.current?.plan_version).toBe(2);
      }
    });

    it("rejects approval when concurrent UPDATE returns no rows", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "proposed" }))
        .mockResolvedValueOnce(null);

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
      }
    });

    it("idempotently returns an already approved exact version", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2, status: "approved" }));

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(true);
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });

    it("accepts approval when plan_version matches and UPDATE succeeds", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "proposed" }))
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "approved", approved_at: "2026-07-28T00:00:00Z" }));

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(true);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Test 3: upload route — a second upload never removes the first     */
/* ------------------------------------------------------------------ */

describe("Upload route — multi-book library is additive", () => {
  let db: FakeDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createDbFake();
    useFakeDb(db);
    mockRequireUserApi.mockResolvedValue({ studentId: SID });
    mockRunPython.mockResolvedValue({ stdout: '{"ok":true,"message":"indexed"}', stderr: "" });
    mockSpawnGeneration.mockResolvedValue(undefined);
  });

  it("after a second upload, the FIRST book is still present and unchanged", async () => {
    const { POST, GET } = await import("@/app/api/upload/route");

    const first = await POST(postForm(pdfFile("first_book.pdf")));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { book: { id: number; filename: string; status: string } };
    const firstId = firstBody.book.id;
    expect(firstBody.book.filename).toBe("first_book.pdf");
    expect(firstBody.book.status).toBe("generating");

    const second = await POST(postForm(pdfFile("second_book.pdf")));
    expect(second.status).toBe(200);

    const listing = await GET();
    const listingBody = (await listing.json()) as {
      books: Array<{ id: number; filename: string; status: string }>;
      book: { id: number; filename: string; status: string } | null;
    };

    expect(listingBody.books.length).toBe(2);
    const firstRow = listingBody.books.find((b) => b.id === firstId);
    expect(firstRow).toBeTruthy();
    expect(firstRow?.filename).toBe("first_book.pdf");
    expect(firstRow?.status).toBe("generating");
    expect(listingBody.books[0].filename).toBe("second_book.pdf");
    expect(listingBody.book?.filename).toBe("second_book.pdf");
    expect(db.documents.length).toBe(2);
  });

  it("retries the same failed document and book without creating duplicates", async () => {
    const { POST } = await import("@/app/api/upload/route");
    mockRunPython
      .mockResolvedValueOnce({ stdout: '{"ok":false,"error":"temporary failure"}', stderr: "" })
      .mockResolvedValueOnce({ stdout: '{"ok":true,"message":"indexed"}', stderr: "" });

    const first = await POST(postForm(pdfFile("retry_book.pdf")));
    expect(first.status).toBe(502);
    const failed = (await first.json()) as {
      documentId: number;
      collectionId: number;
      bookId: number;
    };
    expect(db.documents).toHaveLength(1);
    expect(db.documents[0].status).toBe("failed");
    expect(db.books).toHaveLength(1);

    const retryMetadata = {
      documentId: String(failed.documentId),
      collectionId: String(failed.collectionId),
      bookId: String(failed.bookId),
    };
    const retry = await POST(postForm(null, retryMetadata));
    expect(retry.status).toBe(200);
    expect(db.documents).toHaveLength(1);
    expect(db.documents[0].status).toBe("ready");
    expect(db.books).toHaveLength(1);
    expect(db.books[0].id).toBe(failed.bookId);

    const replay = await POST(postForm(null, retryMetadata));
    expect(replay.status).toBe(200);
    expect(db.documents).toHaveLength(1);
    expect(db.books).toHaveLength(1);
    expect(mockRunPython).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 4: collections route — duplicate create is idempotent         */
/* ------------------------------------------------------------------ */

describe("Collections route — idempotent create", () => {
  let db: FakeDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createDbFake();
    useFakeDb(db);
    mockRequireUserApi.mockResolvedValue({ studentId: SID });
  });

  it("a duplicate create returns the existing collection and inserts no second row", async () => {
    const { POST } = await import("@/app/api/collections/route");

    const first = await POST(
      makeRequest("http://localhost/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Library" }),
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { collection: { id: number }; created: boolean };
    expect(firstBody.created).toBe(true);

    const duplicate = await POST(
      makeRequest("http://localhost/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Library" }),
      }),
    );
    const duplicateBody = (await duplicate.json()) as { collection: { id: number }; created: boolean };

    expect(duplicateBody.created).toBe(false);
    expect(duplicateBody.collection.id).toBe(firstBody.collection.id);
    expect(db.collections.length).toBe(1);
  });

  it("concurrent create requests resolve to one canonical collection", async () => {
    const { POST } = await import("@/app/api/collections/route");
    const request = () =>
      POST(
        makeRequest("http://localhost/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Library" }),
        }),
      );

    const [first, second] = await Promise.all([request(), request()]);
    const firstBody = (await first.json()) as { collection: { id: number }; created: boolean };
    const secondBody = (await second.json()) as { collection: { id: number }; created: boolean };

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(firstBody.collection.id).toBe(secondBody.collection.id);
    expect([firstBody.created, secondBody.created].sort()).toEqual([false, true]);
    expect(db.collections).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 5: documents route — safe removal                             */
/* ------------------------------------------------------------------ */

describe("Documents route — safe removal", () => {
  let db: FakeDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createDbFake();
    useFakeDb(db);
    mockRequireUserApi.mockResolvedValue({ studentId: SID });
  });

  it("removing an unreferenced document succeeds and leaves the other documents intact", async () => {
    const { DELETE } = await import("@/app/api/collections/[collectionId]/documents/route");

    seedCollection(db, 1, SID, "My Library");
    seedDocument(db, 10, 1, SID, "a.pdf", "ready");
    seedDocument(db, 11, 1, SID, "b.pdf", "ready");
    seedDocument(db, 12, 1, SID, "c.pdf", "ready");
    db.books.push({
      id: 20,
      student_id: SID,
      filename: "collections/1/11/b.pdf",
      status: "ready",
    });

    const res = await DELETE(
      makeRequest("http://localhost/api/collections/1/documents?documentId=11"),
      { params: Promise.resolve({ collectionId: "1" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });

    expect(db.documents.length).toBe(2);
    const remaining = db.documents.map((d) => ({ id: d.id, filename: d.filename, status: d.status }));
    expect(remaining).toContainEqual({ id: 10, filename: "a.pdf", status: "ready" });
    expect(remaining).toContainEqual({ id: 12, filename: "c.pdf", status: "ready" });
    expect(db.books).toHaveLength(0);
  });

  it("removing a document referenced by an approved plan is rejected with 409 and nothing is removed", async () => {
    const { DELETE } = await import("@/app/api/collections/[collectionId]/documents/route");

    seedCollection(db, 1, SID, "My Library");
    seedDocument(db, 10, 1, SID, "a.pdf", "ready");
    seedDocument(db, 11, 1, SID, "b.pdf", "ready");
    seedDocument(db, 12, 1, SID, "c.pdf", "ready");
    seedApprovedProgrammeReferencing(db, 1, 11);

    const res = await DELETE(
      makeRequest("http://localhost/api/collections/1/documents?documentId=11"),
      { params: Promise.resolve({ collectionId: "1" }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This source is part of your approved plan and cannot be removed.");

    expect(db.documents.length).toBe(3);
    expect(db.documents.find((d) => d.id === 11)?.filename).toBe("b.pdf");
  });
});

/* ------------------------------------------------------------------ */
/*  Test 6: cross-user access is denied (mocked session identity)      */
/* ------------------------------------------------------------------ */

describe("Cross-user access — denied via mocked session identity", () => {
  let db: FakeDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createDbFake();
    useFakeDb(db);
    mockRequireUserApi.mockResolvedValue({ studentId: SID });
  });

  it("listing another user's collection documents is denied with 403", async () => {
    const { GET } = await import("@/app/api/collections/[collectionId]/documents/route");

    seedCollection(db, 5, OTHER_SID, "Someone else's library");
    seedDocument(db, 10, 5, OTHER_SID, "theirs.pdf", "ready");

    const res = await GET(makeRequest("http://localhost/api/collections/5/documents"), {
      params: Promise.resolve({ collectionId: "5" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("You do not have access to this collection.");
  });

  it("removing another user's document is denied with 403", async () => {
    const { DELETE } = await import("@/app/api/collections/[collectionId]/documents/route");

    seedCollection(db, 5, OTHER_SID, "Someone else's library");
    seedDocument(db, 10, 5, OTHER_SID, "theirs.pdf", "ready");

    const res = await DELETE(
      makeRequest("http://localhost/api/collections/5/documents?documentId=10"),
      { params: Promise.resolve({ collectionId: "5" }) },
    );
    expect(res.status).toBe(403);
    expect(db.documents.length).toBe(1);
  });

  it("retrying another user's document is denied — the student-scoped update touches no rows", async () => {
    const { retryDocument } = await import("@/lib/collections");

    seedDocument(db, 10, 1, OTHER_SID, "theirs.pdf", "failed");

    const result = await retryDocument(10, SID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Document not found or not in failed state.");
    }
    expect(db.documents.find((d) => d.id === 10)?.status).toBe("failed");
    expect(db.documents.find((d) => d.id === 10)?.student_id).toBe(OTHER_SID);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 7: generation — only an EXACT plan version is approved        */
/* ------------------------------------------------------------------ */

describe("Generation — exact-version approval only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an approximate plan version does not approve: no approval write is issued", async () => {
    const { approveProgramme } = await import("@/lib/programmes");

    mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 3, status: "proposed" }));

    const result = await approveProgramme(1, "S-2026-000001", 2);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Stale plan version. Refresh and try again.");
      expect(result.current?.status).toBe("proposed");
      expect(result.current?.plan_version).toBe(3);
    }
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(mockQueryOne.mock.calls[0][0]).not.toContain("UPDATE programmes");
  });

  it("an exact plan_version approval succeeds and records the approved version", async () => {
    const { approveProgramme } = await import("@/lib/programmes");

    mockQueryOne
      .mockResolvedValueOnce(fakeProgramme({ plan_version: 3, status: "proposed" }))
      .mockResolvedValueOnce(fakeProgramme({ plan_version: 3, status: "approved", approved_at: "2026-07-28T00:00:00Z" }));

    const result = await approveProgramme(1, "S-2026-000001", 3);

    expect(result.ok).toBe(true);
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 8: SourceLibrary — refresh reflects real per-document status  */
/* ------------------------------------------------------------------ */

describe("SourceLibrary — re-fetch reflects the real API status per document", () => {
  const READY_A = { id: 1, collection_id: 1, student_id: SID, filename: "a.pdf", status: "ready", error: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
  const READY_B = { id: 2, collection_id: 1, student_id: SID, filename: "b.pdf", status: "ready", error: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
  const FAILED_C = { id: 3, collection_id: 1, student_id: SID, filename: "c.pdf", status: "failed", error: "Could not prepare this book.", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
  const NOW_READY_C = { ...FAILED_C, status: "ready", error: null };

  beforeEach(() => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/clock")) {
        return { ok: true, status: 200, json: async () => ({ now: "2026-07-28T12:00:00.000Z" }) };
      }
      if (url.includes("/api/collections/1/documents")) {
        call += 1;
        const documents = call === 1 ? [READY_A, READY_B, FAILED_C] : [READY_A, READY_B, NOW_READY_C];
        return { ok: true, status: 200, json: async () => ({ documents }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  it("after a partial upload, re-fetching shows each document's real status, not an assumed value", async () => {
    const { rerender } = render(<SourceLibrary collectionId={1} reloadKey={0} />);

    await waitFor(() => {
      expect(screen.getByText("a.pdf")).toBeTruthy();
      expect(screen.getByText("c.pdf")).toBeTruthy();
    });

    expect(screen.queryAllByText("ready").length).toBe(2);
    expect(screen.queryAllByText("failed").length).toBe(1);
    expect(screen.getByText("Could not prepare this book.")).toBeTruthy();

    rerender(<SourceLibrary collectionId={1} reloadKey={1} />);

    await waitFor(() => {
      expect(screen.queryAllByText("failed").length).toBe(0);
    });

    expect(screen.queryAllByText("ready").length).toBe(3);
    expect(screen.queryByText("Could not prepare this book.")).toBeNull();
  });
});
