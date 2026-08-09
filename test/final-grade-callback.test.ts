import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const CALLBACK_SECRET = "final-grade-callback-test-secret";
const STUDENT_SID = "S-2026-000042";
const EXAM_ID = "66f0a1b2c3d4e5f60718293a";
const COMPLETED_AT = new Date("2026-08-08T12:00:00.000Z");

const state = vi.hoisted(() => ({
  grades: [
    {
      student_id: "S-2026-000042",
      kind: "quiz",
      week: 1,
      score: 8,
      max_score: 10,
      flagged: false,
      taken_at: new Date("2026-08-01T12:00:00.000Z"),
      exam_id: "quiz-1",
    },
    {
      student_id: "S-2026-000042",
      kind: "midterm",
      week: 1,
      score: 7,
      max_score: 10,
      flagged: false,
      taken_at: new Date("2026-08-04T12:00:00.000Z"),
      exam_id: "mid-1",
    },
  ] as Array<Record<string, unknown>>,
  transcripts: [] as Array<Record<string, unknown>>,
  finalStatuses: [] as Array<Record<string, unknown>>,
  callbackEvents: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{ text: string; params: unknown[] }>,
  lectureCount: 1,
  semesterPlan: {
    schema_name: "univai.semester.week-plan",
    schema_version: "1.0.0",
    week_count: 1,
    weeks: [{ week: 1 }],
  } as Record<string, unknown>,
}));

const mongoConnect = vi.hoisted(() => vi.fn(async () => {
  throw new Error("Final callbacks must not resolve a week through MongoDB.");
}));
const enqueueStudentEmailNotification = vi.hoisted(() => vi.fn(async () => ({ queued: true })));

vi.mock("@/lib/env", () => ({
  env: {
    EXAM_CALLBACK_SECRET: CALLBACK_SECRET,
    EXAM_SYSTEM_URL: "http://localhost:3200",
    MONGODB_URI: "mongodb://unused",
  },
}));

vi.mock("@/lib/clock", () => ({
  now: async () => COMPLETED_AT,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
}));

vi.mock("mongodb", () => ({ MongoClient: { connect: mongoConnect } }));
vi.mock("@/lib/notification-outbox", () => ({ enqueueStudentEmailNotification }));

vi.mock("@/lib/db", () => {
  async function query(text: string, params: unknown[] = []): Promise<unknown[]> {
    state.queries.push({ text, params });

    if (text.includes("CREATE TABLE IF NOT EXISTS")) return [];
    if (text.includes("SELECT exam_id FROM exam_callback_events")) {
      return state.callbackEvents.filter(
        (event) => event.exam_id === params[0] && event.fingerprint === params[1],
      );
    }
    if (text.includes("INSERT INTO exam_callback_events")) {
      state.callbackEvents.push({ exam_id: params[0], fingerprint: params[1] });
      return [];
    }
    if (text.includes("INSERT INTO grades")) {
      const row = {
        student_id: params[0],
        kind: params[1],
        week: params[2],
        score: params[3],
        max_score: params[4],
        feedback: params[5],
        taken_at: params[6],
        exam_id: params[7],
        flagged: params[8],
        report: params[9],
      };
      const existing = state.grades.findIndex((grade) => grade.exam_id === params[7]);
      if (existing === -1) state.grades.push(row);
      else state.grades[existing] = { ...state.grades[existing], ...row };
      return [];
    }
    if (text.includes("INSERT INTO final_exam_status")) {
      state.finalStatuses.push({
        student_id: params[0],
        exam_id: params[1],
        state: params[3],
      });
      return [];
    }
    if (text.includes("UPDATE grades AS grade")) {
      const repaired: Array<{ taken_at: Date }> = [];
      for (const status of state.finalStatuses) {
        if (status.student_id !== params[0] || status.state !== "graded") continue;
        const grade = state.grades.find(
          (candidate) =>
            candidate.student_id === params[0] && candidate.exam_id === status.exam_id,
        );
        if (grade && grade.kind !== "final") {
          grade.kind = "final";
          grade.week = null;
          grade.max_score = 100;
          if (status.result && typeof status.result === "object") {
            (status.result as Record<string, unknown>).max_score = 100;
          }
          repaired.push({ taken_at: grade.taken_at as Date });
        }
      }
      return repaired;
    }
    if (text.includes("kind = 'final'")) {
      return state.grades
        .filter(
          (grade) =>
            grade.student_id === params[0] &&
            grade.kind === "final" &&
            grade.flagged === false,
        )
        .slice(-1);
    }
    if (text.includes("SELECT semester_plan FROM books")) {
      return [{ semester_plan: state.semesterPlan }];
    }
    if (text.includes("SELECT id, title, filename FROM books")) {
      return [{ id: 7, title: "Callback Course", filename: "callback-course.pdf" }];
    }
    if (text.includes("COUNT(*)::text AS total FROM lectures")) {
      return [{ total: String(state.lectureCount) }];
    }
    if (text.includes("COUNT(*)::text AS attended")) return [{ attended: "1" }];
    if (text.includes("kind IN ('quiz', 'midterm')")) {
      return state.grades.filter(
        (grade) =>
          grade.student_id === params[0] &&
          (grade.kind === "quiz" || grade.kind === "midterm"),
      );
    }
    if (text.includes("INSERT INTO course_transcripts")) {
      state.transcripts.push({
        id: params[0],
        student_id: params[1],
        course_key: params[2],
        course_title: params[3],
        quiz_percentage: params[4],
        attendance_percentage: params[5],
        midterm_percentage: params[6],
        final_percentage: params[7],
        coursework_points: params[8],
        total_percentage: params[9],
        letter_grade: params[10],
        gpa: params[11],
        passed: params[12],
        completed_at: params[13],
        certificate_id: null,
      });
      return [];
    }
    if (text.includes("FROM course_transcripts t")) {
      return state.transcripts.filter(
        (transcript) => transcript.student_id === params[0] && transcript.id === params[1],
      );
    }

    throw new Error(`Unhandled SQL in final callback test: ${text}`);
  }

  return {
    query,
    queryOne: async (text: string, params: unknown[] = []) =>
      (await query(text, params))[0] ?? null,
  };
});

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    exam_id: EXAM_ID,
    type: "final",
    title: "Final: Callback Course",
    student_sid: STUDENT_SID,
    chapter_id: null,
    mark: 8,
    total_questions: 10,
    max_score: 10,
    passing_mark: 5,
    passed: true,
    grading_status: "auto_graded",
    integrity_status: "clean",
    review_status: "not_required",
    report: { flagged: false },
    ...overrides,
  };
}

async function postCallback(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", CALLBACK_SECRET).update(body).digest("hex");
  const { POST } = await import("@/app/api/exams/callback/route");
  return POST(new NextRequest("http://localhost/api/exams/callback", {
    method: "POST",
    headers: { "X-Exam-Signature": signature },
    body,
  }));
}

afterEach(() => {
  state.grades.splice(2);
  state.transcripts = [];
  state.finalStatuses = [];
  state.callbackEvents = [];
  state.queries = [];
  state.lectureCount = 1;
  state.semesterPlan = {
    schema_name: "univai.semester.week-plan",
    schema_version: "1.0.0",
    week_count: 1,
    weeks: [{ week: 1 }],
  };
  mongoConnect.mockClear();
  enqueueStudentEmailNotification.mockClear();
});

describe("final result callback transcript handoff", () => {
  it("stores a final grade and makes it available to transcript scoring", async () => {
    const response = await postCallback(webhook());

    expect(response.status).toBe(200);
    expect(state.grades.at(-1)).toMatchObject({
      student_id: STUDENT_SID,
      kind: "final",
      week: null,
      score: 8,
      max_score: 10,
      exam_id: EXAM_ID,
    });
    expect(state.transcripts).toHaveLength(1);
    expect(state.transcripts[0]).toMatchObject({
      student_id: STUDENT_SID,
      final_percentage: 80,
      total_percentage: 80,
      letter_grade: "A-",
    });
    expect(mongoConnect).not.toHaveBeenCalled();
    expect(enqueueStudentEmailNotification).toHaveBeenCalledWith({
      registrationNumber: STUDENT_SID,
      eventId: expect.stringMatching(/^transcript:tr_/),
      event: {
        type: "transcript.ready",
        courseTitle: "Callback Course",
        grade: "A-",
      },
    });
  });

  it("uses the producer's explicit score scale for a manually graded final", async () => {
    const response = await postCallback(webhook({
      grading_status: "graded",
      review_status: "cleared",
      mark: 78,
      max_score: 100,
      passing_mark: 50,
    }));

    expect(response.status).toBe(200);
    expect(state.grades.at(-1)).toMatchObject({
      kind: "final",
      score: 78,
      max_score: 100,
    });
    expect(state.transcripts[0]).toMatchObject({ final_percentage: 78 });
  });

  it("accepts an in-flight legacy manual callback on its percentage scale", async () => {
    const response = await postCallback(webhook({
      grading_status: "graded",
      review_status: "cleared",
      mark: 78,
      max_score: undefined,
      passing_mark: 50,
    }));

    expect(response.status).toBe(200);
    expect(state.grades.at(-1)).toMatchObject({ score: 78, max_score: 100 });
  });

  it("rejects an unknown assessment type before storing or resolving it", async () => {
    const response = await postCallback(webhook({ type: "essay" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "type must be one of: quiz, mid, final" });
    expect(state.grades).toHaveLength(2);
    expect(state.transcripts).toHaveLength(0);
    expect(state.callbackEvents).toHaveLength(0);
    expect(mongoConnect).not.toHaveBeenCalled();
  });

  it.each([
    [{ exam_id: " " }, "exam_id must be a non-empty string"],
    [{ title: "" }, "title must be a non-empty string"],
    [{ student_sid: null }, "student_sid must be a non-empty string"],
    [{ chapter_id: 42 }, "chapter_id must be a non-empty string or null"],
    [{ total_questions: 1.5 }, "total_questions must be a non-negative safe integer"],
    [{ max_score: -1 }, "max_score must be a non-negative safe integer"],
    [{ mark: 11 }, "mark must be null or between 0 and max_score"],
    [{ passing_mark: -1 }, "passing_mark must be null or between 0 and max_score"],
    [{ passed: "yes" }, "passed must be a boolean"],
    [{ grading_status: "finished" }, "Invalid grading_status"],
    [{ integrity_status: "unknown" }, "Invalid integrity_status"],
    [{ review_status: "unknown" }, "Invalid review_status"],
    [{ report: { flagged: "no" } }, "report.flagged must be a boolean"],
  ])("rejects an invalid signed callback field: %j", async (override, error) => {
    const response = await postCallback(webhook(override));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(state.grades).toHaveLength(2);
    expect(state.transcripts).toHaveLength(0);
  });

  it("repairs a final grade previously misclassified as a midterm", async () => {
    state.grades.push({
      student_id: STUDENT_SID,
      kind: "midterm",
      week: null,
      score: 8,
      max_score: 10,
      flagged: false,
      taken_at: COMPLETED_AT,
      exam_id: EXAM_ID,
    });

    const response = await postCallback(webhook());

    expect(response.status).toBe(200);
    expect(state.grades.filter((grade) => grade.exam_id === EXAM_ID)).toEqual([
      expect.objectContaining({ kind: "final", week: null }),
    ]);
    const gradeWrite = state.queries.find((entry) => entry.text.includes("INSERT INTO grades"));
    expect(gradeWrite?.text).toContain("kind = EXCLUDED.kind");
    expect(gradeWrite?.text).toContain("week = EXCLUDED.week");
    expect(state.transcripts).toHaveLength(1);
  });

  it("recovers an already-recorded final even when another transcript exists", async () => {
    state.grades.push({
      student_id: STUDENT_SID,
      kind: "midterm",
      week: null,
      score: 78,
      max_score: 10,
      flagged: false,
      taken_at: COMPLETED_AT,
      exam_id: EXAM_ID,
    });
    state.finalStatuses.push({
      student_id: STUDENT_SID,
      exam_id: EXAM_ID,
      state: "graded",
      result: { mark: 78, max_score: 10, passed: true },
    });
    state.transcripts.push({
      id: "tr_prior",
      student_id: STUDENT_SID,
      course_key: "book:prior",
    });

    const { recoverMisclassifiedFinalTranscript } = await import("@/lib/transcripts");
    const transcript = await recoverMisclassifiedFinalTranscript(STUDENT_SID);

    expect(state.grades.filter((grade) => grade.exam_id === EXAM_ID)).toEqual([
      expect.objectContaining({ kind: "final", week: null }),
    ]);
    expect(transcript).toMatchObject({ finalPercentage: 78, totalPercentage: 79.2 });
    expect(state.finalStatuses[0]).toMatchObject({
      result: { mark: 78, max_score: 100, passed: true },
    });
    expect(state.transcripts).toHaveLength(2);
  });

  it("counts the one scheduled midterm in a long semester exactly once", async () => {
    state.lectureCount = 8;
    state.semesterPlan = {
      schema_name: "univai.semester.week-plan",
      schema_version: "1.0.0",
      week_count: 8,
      weeks: Array.from({ length: 8 }, (_, index) => ({ week: index + 1 })),
    };
    state.grades.push({
      student_id: STUDENT_SID,
      kind: "final",
      week: null,
      score: 8,
      max_score: 10,
      flagged: false,
      taken_at: COMPLETED_AT,
      exam_id: EXAM_ID,
    });

    const { upsertCourseTranscript } = await import("@/lib/transcripts");
    const transcript = await upsertCourseTranscript(STUDENT_SID, COMPLETED_AT);

    // The old floor(lectureCount / 4) logic expected two midterms here and
    // incorrectly halved this 7/10 score to 35%.
    expect(transcript).toMatchObject({ midtermPercentage: 70 });
  });
});
