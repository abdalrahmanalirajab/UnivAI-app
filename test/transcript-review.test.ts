import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  poolQuery: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  pool: { query: mocks.poolQuery, connect: mocks.connect },
}));

import { getStudentTranscriptAccess, releaseDueTranscripts } from "@/lib/transcripts";

function transcriptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr_review_1",
    course_key: "book:7",
    course_title: "Distributed Systems",
    quiz_percentage: "80",
    attendance_percentage: "90",
    midterm_percentage: "75",
    final_percentage: "85",
    coursework_points: "48",
    total_percentage: "82",
    letter_grade: "A-",
    gpa: "3.7",
    passed: true,
    completed_at: new Date("2026-08-08T12:00:00.000Z"),
    release_at: new Date("2026-08-15T12:00:00.000Z"),
    review_status: "pending",
    reviewed_at: null,
    review_note: null,
    certificate_id: null,
    ...overrides,
  };
}

describe("transcript review window", () => {
  beforeEach(() => vi.clearAllMocks());

  it("releases only untouched pending transcripts after the deadline", async () => {
    mocks.query.mockResolvedValue([{ id: "tr_review_1" }]);
    const time = new Date("2026-08-15T12:00:00.000Z");
    await expect(releaseDueTranscripts(time, "S-2026-000017")).resolves.toBe(1);
    expect(mocks.query.mock.calls[0][0]).toContain("review_status = 'pending'");
    expect(mocks.query.mock.calls[0][0]).toContain("release_at <= $1");
    expect(mocks.query.mock.calls[0][1]).toEqual([time, "S-2026-000017"]);
  });

  it("does not expose grades while review is pending or held", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        transcriptRow(),
        transcriptRow({
          id: "tr_held_2",
          course_key: "book:8",
          course_title: "Data Engineering",
          review_status: "held",
        }),
      ]);
    const access = await getStudentTranscriptAccess(
      "S-2026-000017",
      new Date("2026-08-10T12:00:00.000Z"),
    );
    expect(access.transcripts).toEqual([]);
    expect(access.pending).toEqual([
      expect.objectContaining({ id: "tr_review_1", reviewStatus: "pending" }),
      expect.objectContaining({ id: "tr_held_2", reviewStatus: "held" }),
    ]);
    expect(JSON.stringify(access.pending)).not.toContain("82");
    expect(JSON.stringify(access.pending)).not.toContain("letterGrade");
  });

  it("returns the complete transcript immediately after release", async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: "tr_review_1" }])
      .mockResolvedValueOnce([transcriptRow({ review_status: "released" })]);
    const access = await getStudentTranscriptAccess(
      "S-2026-000017",
      new Date("2026-08-15T12:00:00.000Z"),
    );
    expect(access.pending).toEqual([]);
    expect(access.transcripts[0]).toMatchObject({
      reviewStatus: "released",
      totalPercentage: 82,
      letterGrade: "A-",
    });
  });
});
