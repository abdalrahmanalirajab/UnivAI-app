import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  connect: vi.fn(),
  enqueue: vi.fn(),
  getAttendance: vi.fn(),
  getExamStatuses: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  release: vi.fn(),
  triageAbsence: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { connect: mocks.connect, query: vi.fn() },
  query: mocks.query,
  queryOne: mocks.queryOne,
}));

vi.mock("@/lib/attendance", () => ({ getAttendance: mocks.getAttendance }));
vi.mock("@/lib/exams", () => ({ getExamStatuses: mocks.getExamStatuses }));
vi.mock("@/lib/notification-outbox", () => ({
  enqueueEmailNotificationWithClient: mocks.enqueue,
}));
vi.mock("@/lib/absence-triage", () => ({
  ABSENCE_QUESTION_TEXT: {
    OFFICIAL_DOCUMENT: "Please provide the official document relevant to this absence.",
  },
  triageAbsence: mocks.triageAbsence,
}));

import {
  AbsenceCaseError,
  attachAbsenceEvidence,
  decideAbsenceCase,
  requestAbsenceInformation,
  respondToAbsenceClarification,
  submitAbsenceCase,
} from "@/lib/absence-cases";

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STUDENT_ID = "S-2026-000001";

const client = {
  query: mocks.clientQuery,
  release: mocks.release,
};

function result(rows: unknown[] = [], rowCount = rows.length) {
  return { rows, rowCount };
}

describe("admin-led absence conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(client);
    mocks.enqueue.mockResolvedValue({ queued: true });
    mocks.getAttendance.mockResolvedValue([
      {
        status: "absent",
        week: 2,
        title: "Search and planning",
        lectureId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
    ]);
    mocks.getExamStatuses.mockResolvedValue([]);
    mocks.triageAbsence.mockResolvedValue({
      recommendation: "human_review",
      nextAction: "request_evidence",
      questionCode: "OFFICIAL_DOCUMENT",
      policyClauseIds: ["P04_OFFICIAL_DUTY"],
      sensitivityFlags: ["legal"],
      adminSummary: "A human should decide whether documentation is needed.",
      confidence: 0.72,
      promptId: "absence/triage",
      promptVersion: "1.0.0",
      modelLabel: "bounded-test-model",
      validationStatus: "valid",
    });
  });

  it("routes an AI evidence suggestion to the admin without unlocking learner upload", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT DISTINCT item.item_type")) return [];
      if (sql.includes("FROM absence_case_items")) {
        return [{
          case_id: CASE_ID,
          item_type: "lecture",
          week: 2,
          remedy: "pending",
          lecture_public_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        }];
      }
      if (sql.includes("FROM absence_case_messages AS message")) {
        return [{
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          case_id: CASE_ID,
          actor: "learner",
          message: "I had an official court appointment during the lecture.",
          response_requested: false,
          attachment_requested: false,
          created_at: new Date("2026-08-16T10:00:00.000Z"),
        }];
      }
      if (sql.includes("FROM absence_evidence")) return [];
      throw new Error(`Unexpected query: ${sql}`);
    });
    mocks.queryOne.mockResolvedValue({
      id: CASE_ID,
      status: "pending_admin",
      reason: "I had an official court appointment during the lecture.",
      waiting_on: "admin",
      question_code: "OFFICIAL_DOCUMENT",
      outcome: null,
      decision_reason: null,
      submitted_at: new Date("2026-08-16T10:00:00.000Z"),
      decided_at: null,
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO absence_cases")) return result([{ id: CASE_ID }], 1);
      if (sql.includes("SELECT \"id\"::text AS id FROM \"user\"")) return result([]);
      return result([], 1);
    });

    const created = await submitAbsenceCase(
      { id: USER_ID, registrationNumber: STUDENT_ID },
      "I had an official court appointment during the lecture.",
      [{ itemType: "lecture", week: 2 }],
    );

    expect(created).toMatchObject({ status: "pending_admin", waitingOn: "admin" });
    const caseInsert = mocks.clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO absence_cases"),
    );
    expect(caseInsert?.[0]).toContain("'pending_admin'");
    expect(caseInsert?.[0]).toContain("'admin'");
    expect(
      mocks.clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("actor, question_code") || String(sql).includes("'system'"),
      ),
    ).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("lets an admin ask another question after any number of prior rounds", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM absence_cases AS absence_case") && sql.includes("FOR UPDATE")) {
        return result([{
          student_id: STUDENT_ID,
          user_id: USER_ID,
          clarification_rounds: 7,
          sensitivity_flags: [],
        }]);
      }
      return result([], 1);
    });

    await requestAbsenceInformation(
      ADMIN_ID,
      CASE_ID,
      "Which dates and times were you unable to attend?",
      true,
    );

    const messageInsert = mocks.clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("response_requested, attachment_requested"),
    );
    expect(messageInsert?.[1]).toEqual([
      CASE_ID,
      ADMIN_ID,
      "Which dates and times were you unable to attend?",
      true,
    ]);
    const stateUpdate = mocks.clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("clarification_rounds = $2"),
    );
    expect(stateUpdate?.[1]).toEqual([CASE_ID, 8]);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        userId: USER_ID,
        eventId: `absence-case:${CASE_ID}:question:8`,
        event: expect.objectContaining({
          type: "absence.clarification_required",
          question: expect.stringContaining("requires one JPEG or PNG image"),
        }),
      }),
    );
  });

  it("refuses a learner reply until the admin-requested attachment exists", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT clarification_rounds, sensitivity_flags")) {
        return result([{ clarification_rounds: 3, sensitivity_flags: [] }]);
      }
      if (sql.includes("FROM absence_case_messages") && sql.includes("response_requested")) {
        return result([{ id: REQUEST_ID, attachment_requested: true }]);
      }
      if (sql.includes("FROM absence_evidence")) return result([{ exists: false }]);
      return result([], 1);
    });

    await expect(
      respondToAbsenceClarification(
        { id: USER_ID, registrationNumber: STUDENT_ID },
        CASE_ID,
        "The requested dates were August 10 through August 12.",
      ),
    ).rejects.toMatchObject<Partial<AbsenceCaseError>>({
      code: "ATTACHMENT_REQUIRED",
      status: 409,
    });
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not reuse an older attachment authorization for a newer text-only question", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id::text FROM absence_cases")) {
        return result([{ id: CASE_ID }]);
      }
      if (sql.includes("FROM absence_case_messages") && sql.includes("response_requested")) {
        return result([{ id: REQUEST_ID, attachment_requested: false }]);
      }
      return result([], 1);
    });

    await expect(
      attachAbsenceEvidence(STUDENT_ID, CASE_ID, {
        mimeType: "image/jpeg",
        originalFilename: "notice.jpg",
        bytes: Buffer.from("normalized-image"),
        sha256: "a".repeat(64),
      }),
    ).rejects.toMatchObject<Partial<AbsenceCaseError>>({
      code: "ATTACHMENT_NOT_REQUESTED",
      status: 409,
    });
    expect(
      mocks.clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO absence_evidence"),
      ),
    ).toBe(false);
  });

  it("grants lecture access as a fresh one-time make-up, not a replay", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FOR UPDATE OF absence_case")) {
        return result([{ student_id: STUDENT_ID, user_id: USER_ID }]);
      }
      return result([], 1);
    });
    mocks.queryOne.mockResolvedValue(null);

    await decideAbsenceCase(
      ADMIN_ID,
      CASE_ID,
      "access_only",
      "Approved for one interactive make-up lecture.",
    );

    const remedyUpdate = mocks.clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE absence_case_items"),
    );
    expect(remedyUpdate?.[1]).toEqual(["makeup_live", CASE_ID]);
    expect(String(remedyUpdate?.[0])).toContain("makeup_started_at = NULL");
    expect(String(remedyUpdate?.[0])).not.toContain("'replay'");
  });
});
