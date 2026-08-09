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
  updateProgrammePlan: vi.fn(),
  query: vi.fn(),
  readGeneratedSemesterPlan: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/collections", () => ({
  getOwnedCollection: mocks.getOwnedCollection,
  listDocuments: mocks.listDocuments,
  documentStorageKey: (collectionId: number, documentId: number, filename: string) =>
    `collections/${collectionId}/${documentId}/${filename}`,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/semester-plan", () => ({
  MAX_SEMESTER_WEEKS: 12,
  readGeneratedSemesterPlan: mocks.readGeneratedSemesterPlan,
}));
vi.mock("@/lib/python", () => ({
  runPython: mocks.runPython,
  parseJsonLine: mocks.parseJsonLine,
}));
vi.mock("@/lib/programmes", () => ({
  getProgrammeForCollection: mocks.getProgrammeForCollection,
  createProgrammeIfMissing: mocks.createProgrammeIfMissing,
  updateProgrammePlan: mocks.updateProgrammePlan,
}));

import { POST } from "@/app/api/programmes/route";

const request = (body: Record<string, unknown> = {}) =>
  new NextRequest("http://localhost/api/programmes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collectionId: 5, ...body }),
  });

/** A curriculum the learner has shaped — merging renames the course id. */
const mergedProgramme = {
  id: 9,
  status: "proposed" as const,
  plan_version: 2,
  plan: {
    courses: [{ id: "merged_book-11_book-12", title: "Merged", credits: 4 }],
  },
};

describe("POST /api/programmes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserApi.mockResolvedValue({ registrationNumber: "S-2026-000004" });
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
    mocks.query.mockResolvedValue([{
      filename: "collections/5/11/Lecturer_1.pdf",
      status: "ready",
      error: null,
    }]);
    mocks.readGeneratedSemesterPlan.mockResolvedValue({
      chapterCount: 7,
      semesterCount: 1,
      weekCount: 7,
      semesters: [{ semester: 1, weekCount: 7 }],
    });
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
      async (_registrationNumber: string, _collectionId: number, name: string, plan: unknown) => ({
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
      course_ids: ["book-11"],
      pages: "4",
    }]);
    expect(savedPlan.courses).toHaveLength(1);
    expect(savedPlan.courses[0]).toMatchObject({ id: "book-11", title: "Lecturer 1" });
    expect(savedPlan.semesters).toEqual([
      { id: "semester-1", name: "Semester 1", order: 1, course_ids: ["book-11"] },
    ]);
    expect(savedPlan.course_structure).toEqual([{
      course_id: "book-11",
      chapter_count: 7,
      semesters: [{
        semester: 1,
        week_count: 7,
        theoretical_lectures: 7,
        practical_sections: 7,
        quizzes: 7,
        midterms: 1,
        finals: 1,
      }],
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

  it("repairs an unapproved legacy topic-as-course plan", async () => {
    mocks.getProgrammeForCollection.mockResolvedValue({
      id: 12,
      status: "proposed",
      plan_version: 1,
      plan: {
        courses: [{ id: "T01" }, { id: "T02" }, { id: "T03" }],
        semesters: [{ id: "semester-1", course_ids: ["T01"] }],
      },
    });
    mocks.updateProgrammePlan.mockImplementation(
      async (_id: number, _sid: string, plan: unknown) => ({
        ok: true,
        programme: { id: 12, plan_version: 2, plan },
      }),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.programme.plan.courses).toHaveLength(1);
    expect(body.programme.plan.courses[0].id).toBe("book-11");
    expect(mocks.updateProgrammePlan).toHaveBeenCalledWith(
      12,
      "S-2026-000004",
      expect.any(Object),
      1,
    );
  });

  it("keeps many extracted topics from one book inside one course and one semester", async () => {
    const topic = (id: string, title: string) => ({
      topic_id: id,
      title,
      summary: `${title} summary`,
      prerequisites: [],
      contact_hours: 1,
      total_hours: 2,
      citations: [{ source_filename: "Lecturer_1.pdf", page: Number(id.slice(1)) }],
    });
    mocks.parseJsonLine.mockReturnValue({
      ok: true,
      result: {
        plan: {
          semesters: [
            { index: 1, title: "Semester 1", topics: [topic("T01", "Introduction")] },
            { index: 2, title: "Semester 2", topics: [topic("T02", "Systems")] },
            { index: 3, title: "Semester 3", topics: [topic("T03", "Models")] },
          ],
        },
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.programme.plan.courses).toHaveLength(1);
    expect(body.programme.plan.semesters).toHaveLength(1);
    expect(body.programme.plan.semesters[0].course_ids).toEqual(["book-11"]);
  });

  it("shows a 30-chapter book as one course split across two semesters", async () => {
    mocks.readGeneratedSemesterPlan.mockResolvedValue({
      chapterCount: 30,
      semesterCount: 2,
      weekCount: 24,
      semesters: [
        { semester: 1, weekCount: 12 },
        { semester: 2, weekCount: 12 },
      ],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.programme.plan.courses).toHaveLength(1);
    expect(body.programme.plan.semesters).toHaveLength(2);
    expect(body.programme.plan.course_structure[0]).toMatchObject({
      chapter_count: 30,
      semesters: [
        { week_count: 12, quizzes: 12, midterms: 1, finals: 1 },
        { week_count: 12, quizzes: 12, midterms: 1, finals: 1 },
      ],
    });
  });

  it("allows curriculum building after the first published week while generation continues", async () => {
    mocks.query.mockResolvedValue([{
      filename: "collections/5/11/Lecturer_1.pdf",
      status: "generating",
      error: null,
      generation_ready_weeks: 1,
    }]);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.runPython).toHaveBeenCalledTimes(1);
  });

  it("refuses to rebuild over an edited curriculum without confirmation", async () => {
    // Merging courses mints a new course id, so the old "do the ids still match
    // the ready documents?" guard failed and the route rebuilt straight over
    // the learner's merge. Nothing warned them and the edit was unrecoverable.
    mocks.getProgrammeForCollection.mockResolvedValue(mergedProgramme);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("CURRICULUM_EDITED");
    expect(body.programme.id).toBe(9);
    expect(mocks.runPython).not.toHaveBeenCalled();
  });

  it("rebuilds an edited curriculum once the learner confirms", async () => {
    mocks.getProgrammeForCollection.mockResolvedValue(mergedProgramme);
    mocks.updateProgrammePlan.mockResolvedValue({
      ok: true,
      programme: { ...mergedProgramme, plan_version: 3 },
    });

    // Rebuilding an existing programme is a new VERSION of it, so this answers
    // 200 with the updated plan; 201 is reserved for a first build.
    const response = await POST(request({ rebuildEdited: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.programme.plan_version).toBe(3);
    expect(mocks.runPython).toHaveBeenCalledTimes(1);
  });

  it("builds from the chapter plan alone, before any lecture exists", async () => {
    // The deadlock this guards: lectures are only written once the curriculum
    // is approved, so requiring a published week here left the learner unable
    // to build the curriculum that would have unblocked the lectures.
    mocks.query.mockResolvedValue([{
      filename: "collections/5/11/Lecturer_1.pdf",
      status: "awaiting_approval",
      error: null,
      generation_ready_weeks: 0,
    }]);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.runPython).toHaveBeenCalledTimes(1);
  });

  it("waits only until the first usable week has been published", async () => {
    mocks.query.mockResolvedValue([{
      filename: "collections/5/11/Lecturer_1.pdf",
      status: "generating",
      error: null,
      generation_ready_weeks: 0,
    }]);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("first usable lecture");
    expect(mocks.runPython).not.toHaveBeenCalled();
  });
});
