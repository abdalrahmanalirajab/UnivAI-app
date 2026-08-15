import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runPython: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/python", () => ({
  runPython: mocks.runPython,
  parseJsonLine: (value: string) => JSON.parse(value),
}));

import { triageAbsence } from "@/lib/absence-triage";

function envelope(result: Record<string, unknown>) {
  return JSON.stringify({
    ok: true,
    result: {
      validation_status: "valid",
      prompt_id: "absence/triage",
      prompt_version: "1.0.0",
      model_label: "bounded-test-model",
      result,
    },
  });
}

describe("absence triage boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only a schema-bounded recommendation and approved question code", async () => {
    mocks.runPython.mockResolvedValue({
      ok: true,
      stderr: "",
      stdout: envelope({
        recommendation: "human_review",
        next_action: "request_evidence",
        question_code: "OFFICIAL_DOCUMENT",
        policy_clause_ids: ["P04_OFFICIAL_DUTY"],
        sensitivity_flags: ["legal"],
        admin_summary: "The learner reports a compulsory legal duty; a human must inspect any document.",
        confidence: 0.72,
      }),
    });

    await expect(triageAbsence("specific unverified facts", "None")).resolves.toMatchObject({
      recommendation: "human_review",
      nextAction: "request_evidence",
      questionCode: "OFFICIAL_DOCUMENT",
      validationStatus: "valid",
    });
  });

  it("fails closed when the model invents a question or final decision", async () => {
    mocks.runPython.mockResolvedValue({
      ok: true,
      stderr: "",
      stdout: envelope({
        recommendation: "approved",
        next_action: "ask_clarification",
        question_code: "SEND_ME_YOUR_PRIVATE_RECORDS",
        policy_clause_ids: ["P01_DOCUMENTED_EMERGENCY"],
        sensitivity_flags: [],
        admin_summary: "This malformed output must never reach the learner.",
        confidence: 1,
      }),
    });

    await expect(triageAbsence("facts", "None")).resolves.toMatchObject({
      recommendation: "human_review",
      nextAction: "pending_admin",
      questionCode: null,
      validationStatus: "fallback",
    });
  });

  it("routes directly to human review when the Agent is unavailable", async () => {
    mocks.runPython.mockResolvedValue({ ok: false, stderr: "offline", stdout: "" });
    await expect(triageAbsence("facts", "None")).resolves.toMatchObject({
      recommendation: "human_review",
      nextAction: "pending_admin",
      confidence: 0,
    });
  });
});
