import { describe, expect, it } from "vitest";

import {
  finalExamCaseViewAt,
  finalizationCandidateAt,
  type StoredFinalResult,
} from "@/lib/final-exam-retakes";
import { retakeWindowForRequest } from "@/lib/final-exam-policy";

type CaseRow = Parameters<typeof finalExamCaseViewAt>[0];

const PERFECT: StoredFinalResult = {
  examId: "primary-exam",
  title: "Final: Reliable Systems",
  mark: 100,
  maxScore: 100,
  passed: true,
  submittedAt: "2026-08-10T18:00:00.000Z",
  report: { flagged: false },
};

function finalCase(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    student_id: "S-2026-000042",
    curriculum_id: "66f0a1b2c3d4e5f607182930",
    primary_opens_at: new Date("2026-08-10T00:00:00.000Z"),
    primary_closes_at: new Date("2026-08-11T00:00:00.000Z"),
    request_deadline: new Date("2026-08-25T00:00:00.000Z"),
    primary_exam_id: null,
    primary_submitted_at: null,
    primary_result: null,
    retake_requested_at: null,
    retake_reason: null,
    retake_available_at: null,
    retake_closes_at: null,
    retake_exam_id: null,
    retake_submitted_at: null,
    retake_result: null,
    declined_at: null,
    declined_by: null,
    decline_reason: null,
    finalized_at: null,
    finalization_reason: null,
    official_exam_id: null,
    official_result: null,
    ...overrides,
  };
}

describe("final-exam retake policy", () => {
  it("allows a retake request after the primary closes even for a perfect result", () => {
    const row = finalCase({
      primary_exam_id: PERFECT.examId,
      primary_submitted_at: new Date(PERFECT.submittedAt),
      primary_result: PERFECT,
    });
    const view = finalExamCaseViewAt(row, new Date("2026-08-11T00:00:00.000Z"));
    expect(view.phase).toBe("request-open");
    expect(view.canRequestRetake).toBe(true);
    expect(view.provisionalResult).toEqual({ mark: 100, maxScore: 100, passed: true });
  });

  it("schedules the reserve form seven days after the request for 24 hours", () => {
    const requestedAt = new Date("2026-08-12T09:30:00.000Z");
    expect(retakeWindowForRequest(requestedAt)).toEqual({
      availableAt: new Date("2026-08-19T09:30:00.000Z"),
      closesAt: new Date("2026-08-20T09:30:00.000Z"),
    });
  });

  it("keeps the original result when an accepted retake is not taken", () => {
    const row = finalCase({
      primary_submitted_at: new Date(PERFECT.submittedAt),
      primary_result: PERFECT,
      retake_requested_at: new Date("2026-08-12T09:30:00.000Z"),
      retake_reason: "A building-wide electricity outage interrupted the exam.",
      retake_available_at: new Date("2026-08-19T09:30:00.000Z"),
      retake_closes_at: new Date("2026-08-20T09:30:00.000Z"),
    });
    expect(finalizationCandidateAt(row, new Date("2026-08-20T09:30:00.000Z"))).toEqual({
      result: PERFECT,
      reason: "retake_not_taken",
    });
  });

  it("waits for grading when the reserve paper was submitted before close", () => {
    const row = finalCase({
      primary_submitted_at: new Date(PERFECT.submittedAt),
      primary_result: PERFECT,
      retake_requested_at: new Date("2026-08-12T09:30:00.000Z"),
      retake_reason: "A building-wide electricity outage interrupted the exam.",
      retake_available_at: new Date("2026-08-19T09:30:00.000Z"),
      retake_closes_at: new Date("2026-08-20T09:30:00.000Z"),
      retake_submitted_at: new Date("2026-08-20T09:00:00.000Z"),
    });
    expect(finalizationCandidateAt(row, new Date("2026-08-20T09:30:00.000Z"))).toBeNull();
    expect(finalExamCaseViewAt(row, new Date("2026-08-20T09:30:00.000Z")).phase)
      .toBe("awaiting-grade");
  });

  it("finalizes a learner who never submitted as Absent — 0 (F)", () => {
    const decision = finalizationCandidateAt(
      finalCase(),
      new Date("2026-08-25T00:00:00.000Z"),
    );
    expect(decision?.reason).toBe("request_window_expired");
    expect(decision?.result).toMatchObject({ mark: 0, maxScore: 100, passed: false });
    expect(decision?.result.report).toMatchObject({ absent: true });
  });

  it("uses a completed reserve result as the official replacement", () => {
    const retake = { ...PERFECT, examId: "reserve-exam", mark: 72, passed: true };
    const decision = finalizationCandidateAt(
      finalCase({ retake_result: retake }),
      new Date("2026-08-19T12:00:00.000Z"),
    );
    expect(decision).toEqual({ result: retake, reason: "retake_completed" });
  });
});
