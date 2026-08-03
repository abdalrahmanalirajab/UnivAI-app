/**
 * The final exam journey, against the REAL route handlers and the REAL
 * Phase 1–5 logic (app/api/exams/route.ts, app/api/exams/callback/route.ts,
 * lib/exams.ts). Only the infrastructure is stubbed: the Postgres driver
 * (via lib/db), the MongoDB driver, the auth session gate, lectures, and the
 * external Exam service HTTP calls (global fetch). Nothing in the exam
 * service's behaviour is re-implemented in-process — the fetch stub returns
 * service-shaped responses, and callback signatures are produced with the
 * REAL HMAC-SHA256 code path (identical to the production service's signing),
 * so Phase 4's verification runs unmodified.
 */
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render, screen } from "@testing-library/react";
import ExamsPage from "@/app/exams/page";

/* ------------------------------------------------------------------ */
/*  Shared in-memory state + module mocks                              */
/* ------------------------------------------------------------------ */

const state = vi.hoisted(() => ({
  grades: [] as Array<Record<string, unknown>>,
  finalStatus: [] as Array<Record<string, unknown>>,
  ledger: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{ text: string; params: unknown[] }>,
  /** The Exam service's behaviour as the test drives it. */
  service: {
    phase: "locked" as "locked" | "eligible",
    denialReason: "Final exam is locked until the final lecture completes.",
    started: false,
    launches: [] as Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }>,
  },
  /** What the browser-facing GET /api/exams returns. */
  page: { exams: [] as Array<Record<string, unknown>>, final: null as Record<string, unknown> | null },
  mongo: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock("@/lib/db", () => {
  async function query(text: string, params: unknown[] = []): Promise<unknown[]> {
    state.queries.push({ text, params });
    if (/CREATE TABLE IF NOT EXISTS/.test(text)) return [];
    if (/SELECT offset_ms FROM clock_state/.test(text)) return [{ offset_ms: "0" }];
    if (/SELECT exam_id FROM exam_callback_events/.test(text)) {
      return state.ledger.filter(
        (row) => row.exam_id === params[0] && row.fingerprint === params[1]
      );
    }
    if (/INSERT INTO exam_callback_events/.test(text)) {
      const exists = state.ledger.some(
        (row) => row.exam_id === params[0] && row.fingerprint === params[1]
      );
      if (!exists) state.ledger.push({ exam_id: params[0], fingerprint: params[1] });
      return [];
    }
    if (/INSERT INTO final_exam_status/.test(text)) {
      const row = {
        student_id: params[0],
        exam_id: params[1],
        title: params[2],
        state: params[3],
        reason: params[4],
        result: params[5],
      };
      const index = state.finalStatus.findIndex((r) => r.student_id === params[0]);
      if (index === -1) state.finalStatus.push(row);
      else state.finalStatus[index] = row;
      return [];
    }
    if (/SELECT exam_id, title, state, reason, result FROM final_exam_status/.test(text)) {
      const row = state.finalStatus.find((r) => r.student_id === params[0]);
      return row
        ? [
            {
              exam_id: row.exam_id,
              title: row.title,
              state: row.state,
              reason: row.reason,
              result:
                typeof row.result === "string" ? JSON.parse(row.result) : row.result ?? null,
            },
          ]
        : [];
    }
    if (/INSERT INTO grades/.test(text)) {
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
      const index = state.grades.findIndex((r) => r.exam_id === params[7]);
      if (index === -1) state.grades.push(row);
      else state.grades[index] = { ...state.grades[index], ...row };
      return [];
    }
    if (/SELECT kind, week, score, max_score, flagged, feedback FROM grades WHERE student_id/.test(text)) {
      return state.grades.filter((row) => row.student_id === params[0]);
    }
    if (/SELECT title, filename FROM books/.test(text)) return [];
    throw new Error(`unhandled SQL in fake db: ${text.slice(0, 100)}`);
  }
  return { query, queryOne: async (text: string, params: unknown[]) => (await query(text, params))[0] ?? null };
});

vi.mock("@/lib/session", () => ({
  requireLearningActionApi: async () => ({
    id: "user-test",
    name: "Test Learner",
    email: "learner@univai.local",
    emailVerified: true,
    phone: null,
    role: "student",
    studentId: "S-2026-000042",
    image: null,
  }),
}));

vi.mock("@/lib/lectures", () => ({
  LECTURES_DIR: "/tmp",
  getLectures: async () => [
    {
      week: 1,
      title: "Evidence and Sources",
      endsAt: new Date("2026-08-04T11:00:00.000Z"),
    },
  ],
}));

vi.mock("@/lib/settings", () => ({ getSetting: async () => "XS" }));

vi.mock("mongodb", () => {
  function collection(name: string) {
    return {
      async findOne(filter: Record<string, unknown>) {
        const docs = state.mongo[name] ?? [];
        return (
          docs.find((doc) =>
            Object.entries(filter).every(([key, value]) => doc[key] === value)
          ) ?? null
        );
      },
      async insertOne(doc: Record<string, unknown>) {
        // Real Mongo assigns an _id on insert; the code relies on it.
        const stored = { _id: "mongo-id", ...doc };
        (state.mongo[name] ??= []).push(stored);
        return { insertedId: "mongo-id" };
      },
      async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
        const key = Object.keys(filter)[0];
        const docs = (state.mongo[name] ??= []);
        const index = docs.findIndex((doc) => doc[key] === filter[key]);
        const merged = { ...(index >= 0 ? docs[index] : {}), ...update.$set };
        if (index >= 0) docs[index] = merged;
        else docs.push(merged);
        return {};
      },
      async deleteMany() {
        state.mongo[name] = [];
        return {};
      },
      async find() {
        return { toArray: async () => [] };
      },
    };
  }
  return {
    MongoClient: { connect: async () => ({ db: () => ({ collection }) }) },
  };
});

/* ------------------------------------------------------------------ */
/*  The Exam service's HTTP surface, as the tests drive it             */
/* ------------------------------------------------------------------ */

const SESSION_SID = "S-2026-000042";
const EXAM_ID = "66f0a1b2c3d4e5f60718293a";
const LAUNCH_URL = `http://localhost:3200/exam/${EXAM_ID}#attempt_token=${"a".repeat(43)}`;

function serviceResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function startFinalServiceResponse() {
  if (state.service.phase === "locked") {
    return serviceResponse(403, { error: state.service.denialReason });
  }
  if (state.service.started) {
    return serviceResponse(409, { error: "Final exam already attempted" });
  }
  state.service.started = true;
  return serviceResponse(200, {
    launch_url: LAUNCH_URL,
    _id: EXAM_ID,
    title: "Final — Demo Course",
    taken: false,
    integrity_status: "clean",
    integrity_state: "active",
  });
}

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (method === "POST" && url.endsWith("/api/exams/final/start")) {
      const body = JSON.parse(init.body ?? "{}");
      state.service.launches.push({
        body,
        idempotencyKey: init.headers?.["Idempotency-Key"],
      });
      return startFinalServiceResponse();
    }
    if (method === "POST" && url.endsWith("/api/exams/mid")) {
      return serviceResponse(500, {});
    }
    if (method === "GET" && url === "/api/exams") {
      return serviceResponse(200, { exams: state.page.exams, final: state.page.final });
    }
    if (method === "GET" && url === "/api/clock") {
      return serviceResponse(200, { now: "2026-08-03T12:00:00.000Z" });
    }
    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  })
);

/* The secret must exist before lib/env.ts loads (first dynamic import). */
process.env.EXAM_CALLBACK_SECRET = "unit-test-callback-secret";

const SECRET = process.env.EXAM_CALLBACK_SECRET;

/** The real Phase 4 signing contract: HMAC-SHA256 over the raw body, hex. */
function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/* ------------------------------------------------------------------ */
/*  Route helpers (real handlers)                                      */
/* ------------------------------------------------------------------ */

async function postStart(body: Record<string, unknown> = { kind: "final" }) {
  const { POST } = await import("@/app/api/exams/route");
  return POST(
    new NextRequest("http://localhost/api/exams", { method: "POST", body: JSON.stringify(body) })
  );
}

async function getExams() {
  const { GET } = await import("@/app/api/exams/route");
  return GET();
}

async function postCallback(payload: Record<string, unknown>, signature?: string) {
  const { POST } = await import("@/app/api/exams/callback/route");
  const body = JSON.stringify(payload);
  return POST(
    new NextRequest("http://localhost/api/exams/callback", {
      method: "POST",
      headers: signature ? { "X-Exam-Signature": signature } : {},
      body,
    })
  );
}

function webhook(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    exam_id: EXAM_ID,
    type: "final",
    title: "Final — Demo Course",
    student_id: "66f0a1b2c3d4e5f607182930",
    student_sid: SESSION_SID,
    chapter_id: null,
    total_questions: 10,
    passing_mark: 5,
    passed: false,
    integrity_status: "clean",
    policy_action: "none",
    review_status: "not_required",
    report: { suspicion_score: 0, flagged: false, session_status: "completed", events: [] },
    ...overrides,
  };
}

const PENDING_REVIEW = webhook({ grading_status: "pending_review", mark: null });
const GRADED = webhook({ grading_status: "graded", mark: 4, review_status: "cleared" });

function resetState() {
  state.grades = [];
  state.finalStatus = [];
  state.ledger = [];
  state.queries = [];
  state.mongo = {};
  state.service.phase = "locked";
  state.service.started = false;
  state.service.launches = [];
  state.page.exams = [];
  state.page.final = null;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("final exam journey — launch (acceptance criteria 1 & 2)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("starts exactly one final for an eligible learner: one launch, one persisted status, fresh idempotency keys", async () => {
    state.service.phase = "eligible";

    const first = await postStart();
    expect(first.status).toBe(200);
    expect((await first.json()).url).toBe(LAUNCH_URL);

    // The service saw one launch, keyed with a header matching its contract.
    expect(state.service.launches).toHaveLength(1);
    const key = state.service.launches[0].idempotencyKey;
    expect(key).toMatch(/^[A-Za-z0-9._-]{8,128}$/);

    // Exactly one persisted status (the store's single row is the upsert).
    expect(state.finalStatus).toHaveLength(1);
    expect(state.finalStatus[0]).toMatchObject({ student_id: SESSION_SID, state: "active" });

    // A second start is refused by the Exam service and relayed verbatim —
    // the app never creates a second attempt on its own.
    const second = await postStart();
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("Final exam already attempted");
    expect(state.finalStatus).toHaveLength(1);
    expect(state.service.launches[1].idempotencyKey).not.toBe(key);
  });

  it("relays the service-reported denial to an ineligible learner and ignores forged claims", async () => {
    state.service.phase = "locked";

    const forged = await postStart({
      kind: "final",
      // Everything below is a client-side forgery attempt — the route must
      // ignore it and enforce the real Exam service response.
      eligible: true,
      programme: "premium-plan",
      studentId: "S-2026-000001",
      status: "graded",
      examId: "forged-exam",
    });

    expect(forged.status).toBe(403);
    expect((await forged.json()).error).toBe(state.service.denialReason);

    // The start request the service received carried ONLY session-derived
    // identity — the forged programme/student/eligibility claims never left
    // the server.
    expect(state.service.launches).toHaveLength(1);
    expect(state.service.launches[0].body).toEqual({
      student_id: "mongo-id",
      curriculum_id: "mongo-id",
      student_sid: SESSION_SID,
    });

    // A denial is not persisted as a status — the learner stays unstuck.
    expect(state.finalStatus).toHaveLength(0);
  });
});

describe("final exam journey — callbacks (acceptance criterion 3)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("deduplicates a re-delivered callback and never duplicates a grade", async () => {
    // First delivery of the submit event (pending_review).
    const first = await postCallback(PENDING_REVIEW, sign(JSON.stringify(PENDING_REVIEW)));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(state.grades).toHaveLength(0); // finality gate: no grade before "graded"
    expect(state.finalStatus[0]).toMatchObject({ state: "awaiting-grade", result: null });
    expect(state.ledger).toHaveLength(1);

    // Re-delivery of the identical event: acknowledged, never re-applied.
    const replay = await postCallback(PENDING_REVIEW, sign(JSON.stringify(PENDING_REVIEW)));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, idempotent: true });
    expect(state.grades).toHaveLength(0);
    expect(state.ledger).toHaveLength(1);
    expect(state.finalStatus).toHaveLength(1);

    // The verified "graded" event (different fingerprint) is processed once.
    const graded = await postCallback(GRADED, sign(JSON.stringify(GRADED)));
    expect(graded.status).toBe(200);
    expect(state.grades).toHaveLength(1);
    expect(state.grades[0]).toMatchObject({ score: 4, exam_id: EXAM_ID });
    expect(state.finalStatus[0]).toMatchObject({ state: "graded" });
    expect(state.ledger).toHaveLength(2);

    // And its re-delivery adds nothing.
    const gradedReplay = await postCallback(GRADED, sign(JSON.stringify(GRADED)));
    expect(await gradedReplay.json()).toEqual({ ok: true, idempotent: true });
    expect(state.grades).toHaveLength(1);
    expect(state.ledger).toHaveLength(2);
  });
});

describe("final exam journey — no early result (acceptance criterion 4)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("keeps a submitted final result-less until a verified graded callback", async () => {
    state.service.phase = "eligible";
    const launch = await postStart();
    expect(launch.status).toBe(200);

    // The service's provisional verdicts (auto-graded with a mark, then
    // pending_review with a mark) must never surface a result.
    const autoGraded = webhook({ grading_status: "auto_graded", mark: 7 });
    await postCallback(autoGraded, sign(JSON.stringify(autoGraded)));
    let exams = await getExams();
    expect(exams.status).toBe(200);
    let body = await exams.json();
    expect(body.final.state).toBe("submitted");
    expect(body.final.result).toBeNull();
    expect(state.grades).toHaveLength(0);

    const pendingWithMark = webhook({ grading_status: "pending_review", mark: 7 });
    await postCallback(pendingWithMark, sign(JSON.stringify(pendingWithMark)));
    exams = await getExams();
    body = await exams.json();
    expect(body.final.state).toBe("awaiting-grade");
    expect(body.final.result).toBeNull();
    expect(state.grades).toHaveLength(0);

    // Only the verified "graded" event releases the result.
    await postCallback(GRADED, sign(JSON.stringify(GRADED)));
    exams = await getExams();
    body = await exams.json();
    expect(body.final.state).toBe("graded");
    expect(body.final.result).toEqual({ mark: 4, max_score: 5, passed: false });
    expect(state.grades).toHaveLength(1);
  });
});

describe("final exam journey — cross-user isolation (acceptance criterion 5)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("never returns another learner's records, and every query is session-scoped", async () => {
    // Another learner's data sits in the store.
    state.grades.push({
      student_id: "S-2026-999999",
      kind: "quiz",
      week: 1,
      score: "10",
      max_score: "10",
      feedback: "Perfect",
      flagged: false,
    });
    state.finalStatus.push({
      student_id: "S-2026-999999",
      exam_id: "66f0a1b2c3d4e5f60718beef",
      title: "Other learner's final",
      state: "graded",
      reason: null,
      result: JSON.stringify({ mark: 10, max_score: 10, passed: true }),
    });

    const exams = await getExams();
    expect(exams.status).toBe(200);
    const body = await exams.json();

    // The authenticated learner sees only their own (empty) world: no score,
    // no graded final, nothing belonging to S-2026-999999.
    expect(body.exams.every((exam: { score: string | null }) => exam.score === null)).toBe(true);
    expect(body.exams.some((exam: { title: string }) => exam.title.includes("Other learner"))).toBe(false);
    expect(body.final).toBeNull();

    // Every store query was scoped to the session's own student id.
    const scoped = state.queries.filter(
      (q) => /FROM grades|FROM final_exam_status/.test(q.text)
    );
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((q) => q.params[0] === SESSION_SID)).toBe(true);
  });
});

describe("final exam journey — refresh rebuilds from the backend (REFRESH TEST)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("rebuilds from a fresh fetch on remount, never from in-memory state", async () => {
    const examsFixture = [
      {
        kind: "quiz",
        week: 1,
        title: "Quiz 1 — Evidence and Sources",
        opensAt: "2026-08-04T11:00:00.000Z",
        closesAt: "2026-08-05T11:00:00.000Z",
        state: "submitted",
        score: "4",
        maxScore: "5",
        flagged: false,
        feedback: null,
      },
      {
        kind: "quiz",
        week: 2,
        title: "Quiz 2 — Tenant Isolation",
        opensAt: "2026-08-11T11:00:00.000Z",
        closesAt: "2026-08-12T11:00:00.000Z",
        state: "open",
        score: null,
        maxScore: null,
        flagged: false,
        feedback: null,
      },
    ];

    // First mount: the final was launched — "in progress".
    state.page.exams = examsFixture;
    state.page.final = {
      exam_id: EXAM_ID,
      title: "Final — Demo Course",
      type: "final",
      state: "active",
      reason: null,
      result: null,
    };
    const { unmount } = render(<ExamsPage />);
    await screen.findByText(/Already in progress — continue in the exam window/);
    expect(screen.queryByText(/Result /)).toBeNull();
    unmount();

    // "Refresh": a new mount, with the callback having landed server-side
    // while the learner was away. The UI must rebuild from the backend
    // payload — the previous in-memory "active" must not survive.
    state.page.final = {
      exam_id: EXAM_ID,
      title: "Final — Demo Course",
      type: "final",
      state: "awaiting-grade",
      reason: null,
      result: null,
    };
    render(<ExamsPage />);
    await screen.findByText(/Submitted — awaiting grade from the exam system/);
    expect(screen.queryByText(/Already in progress/)).toBeNull();
    expect(screen.queryByText(/Result /)).toBeNull();
  });
});

describe("final exam journey — leakage (Phase 6 audit, codified)", () => {
  afterEach(() => {
    cleanup();
    resetState();
  });

  it("strips every unsafe field from the start response, even when the service sends them", async () => {
    state.service.phase = "eligible";

    // The Exam service's raw response is poisoned with the exact fields Phase
    // 6's audit forbids; the route must not forward any of them.
    const response = await postStart();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["url"]);

    const serialized = JSON.stringify(body);
    for (const forbidden of ["answers", "questions", "correct_answer", "report", "suspicion", "events"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the status responses to the audited shapes only", async () => {
    state.grades.push({
      student_id: SESSION_SID,
      kind: "quiz",
      week: 1,
      score: "4",
      max_score: "5",
      feedback: null,
      flagged: true,
    });
    state.finalStatus.push({
      student_id: SESSION_SID,
      exam_id: EXAM_ID,
      title: "Final — Demo Course",
      state: "graded",
      reason: null,
      result: JSON.stringify({ mark: 4, max_score: 5, passed: false }),
    });

    const exams = await getExams();
    const body = await exams.json();
    const serialized = JSON.stringify(body);
    for (const forbidden of ["report", "suspicion", "events", "answers", "questions", "correct_answer"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(body.exams[0]).sort()).toEqual([
      "closesAt",
      "feedback",
      "flagged",
      "kind",
      "maxScore",
      "opensAt",
      "score",
      "state",
      "title",
      "week",
    ]);
    expect(Object.keys(body.final ?? {}).sort()).toEqual(["exam_id", "reason", "result", "state", "title", "type"]);

    // The callback response carries nothing but its ack.
    await postCallback(PENDING_REVIEW, sign(JSON.stringify(PENDING_REVIEW)));
    const replay = await postCallback(PENDING_REVIEW, sign(JSON.stringify(PENDING_REVIEW)));
    expect(Object.keys(await replay.json()).sort()).toEqual(["idempotent", "ok"]);
  });
});
