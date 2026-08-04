import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUserApi: vi.fn(),
  getOwnedCollection: vi.fn(),
  listDocuments: vi.fn(),
  runPython: vi.fn(),
  parseJsonLine: vi.fn(),
  getProgrammeForCollection: vi.fn(),
  createProgrammeIfMissing: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/collections", () => ({
  getOwnedCollection: mocks.getOwnedCollection,
  listDocuments: mocks.listDocuments,
}));
vi.mock("@/lib/python", () => ({
  runPython: mocks.runPython,
  parseJsonLine: mocks.parseJsonLine,
}));
vi.mock("@/lib/programmes", () => ({
  getProgrammeForCollection: mocks.getProgrammeForCollection,
  createProgrammeIfMissing: mocks.createProgrammeIfMissing,
}));

import { POST } from "@/app/api/programmes/route";

const request = () => new NextRequest("http://localhost/api/programmes", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ collectionId: 5 }),
});

describe("POST /api/programmes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserApi.mockResolvedValue({ studentId: "S-2026-000004" });
    mocks.getOwnedCollection.mockResolvedValue({
      owned: true,
      collection: { id: 5, name: "My Library" },
    });
    mocks.getProgrammeForCollection.mockResolvedValue(null);
    mocks.listDocuments.mockResolvedValue([{
      id: 11,
      collection_id: 5,
      student_id: "S-2026-000004",
      filename: "Lecturer_1.pdf",
      status: "ready",
      error: null,
      created_at: "2026-08-04T00:00:00Z",
      updated_at: "2026-08-04T00:00:00Z",
    }]);
    mocks.runPython.mockResolvedValue({ ok: true, stdout: "result", stderr: "" });
    mocks.parseJsonLine.mockReturnValue({
      ok: true,
      result: {
        plan: {
          semesters: [{
            index: 1,
            title: "Semester 1",
            topics: [{
              topic_id: "T01",
              title: "Modeling and Simulation",
              summary: "Grounded introduction",
              prerequisites: [],
              contact_hours: 2.4,
              total_hours: 6,
              citations: [{ source_filename: "Lecturer_1.pdf", page: 4 }],
            }],
          }],
        },
      },
    });
    mocks.createProgrammeIfMissing.mockImplementation(
      async (_studentId: string, _collectionId: number, name: string, plan: unknown) => ({
        id: 9,
        name,
        plan,
      }),
    );
  });

  it("creates and returns a real programme ID with app document citations", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.programme.id).toBe(9);
    expect(mocks.runPython).toHaveBeenCalledWith(
      "services/rag-tools/rag_plan.py",
      expect.arrayContaining(["5", "S-2026-000004"]),
      60 * 60_000,
    );
    const savedPlan = mocks.createProgrammeIfMissing.mock.calls[0][3];
    expect(savedPlan.source_coverage).toEqual([{
      document_id: 11,
      filename: "Lecturer_1.pdf",
      course_ids: ["T01"],
      pages: "4",
    }]);
  });

  it("returns an existing programme without regenerating it", async () => {
    mocks.getProgrammeForCollection.mockResolvedValue({ id: 12 });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.programme.id).toBe(12);
    expect(mocks.runPython).not.toHaveBeenCalled();
  });
});
