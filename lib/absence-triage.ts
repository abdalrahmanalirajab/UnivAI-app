import "server-only";

import { Buffer } from "node:buffer";
import { parseJsonLine, runPython } from "./python";

export const ABSENCE_QUESTION_TEXT = {
  CAUSE_AND_TIMING: "State the specific event and when it prevented your attendance.",
  DIRECT_IMPACT: "Explain how that event directly prevented this lecture or quiz.",
  OFFICIAL_DOCUMENT: "Attach an image of the relevant official or legal document for a human administrator.",
  MEDICAL_DOCUMENT: "Attach an image of available medical documentation for a human administrator. You may hide unrelated details.",
  OUTAGE_DETAILS: "State the provider, location, and exact outage period so an administrator can review it.",
} as const;

const RECOMMENDATIONS = [
  "recommend_excused", "recommend_access_only", "recommend_unexcused", "human_review",
] as const;
const NEXT_ACTIONS = ["pending_admin", "ask_clarification", "request_evidence"] as const;
const POLICY_CODES = [
  "P01_DOCUMENTED_EMERGENCY", "P02_SERIOUS_HEALTH", "P03_BEREAVEMENT",
  "P04_OFFICIAL_DUTY", "P05_TECHNICAL_OUTAGE", "P06_ORDINARY_CONFLICT",
  "P07_INSUFFICIENT_DETAIL", "P08_ACCESS_ONLY",
] as const;
const SENSITIVITY_FLAGS = ["legal", "medical", "personal_safety", "bereavement"] as const;

export type AbsenceQuestionCode = keyof typeof ABSENCE_QUESTION_TEXT;
export type AbsenceTriage = {
  recommendation: (typeof RECOMMENDATIONS)[number];
  nextAction: (typeof NEXT_ACTIONS)[number];
  questionCode: AbsenceQuestionCode | null;
  policyClauseIds: string[];
  sensitivityFlags: string[];
  adminSummary: string;
  confidence: number;
  promptId: string;
  promptVersion: string;
  modelLabel: string | null;
  validationStatus: "valid" | "fallback";
};

type BridgeEnvelope = {
  ok?: boolean;
  result?: {
    validation_status?: unknown;
    prompt_id?: unknown;
    prompt_version?: unknown;
    model_label?: unknown;
    result?: Record<string, unknown>;
  };
};

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function fallback(): AbsenceTriage {
  return {
    recommendation: "human_review",
    nextAction: "pending_admin",
    questionCode: null,
    policyClauseIds: ["P07_INSUFFICIENT_DETAIL"],
    sensitivityFlags: [],
    adminSummary: "Automated triage was unavailable; a human must review the learner statement.",
    confidence: 0,
    promptId: "absence/triage",
    promptVersion: "1.0.0",
    modelLabel: null,
    validationStatus: "fallback",
  };
}

function validateEnvelope(envelope: BridgeEnvelope | null): AbsenceTriage | null {
  if (!envelope?.ok || !envelope.result?.result) return null;
  const outer = envelope.result;
  const value = outer.result;
  if (!value) return null;
  const recommendation = value.recommendation;
  const nextAction = value.next_action;
  const questionCode = value.question_code;
  const policies = value.policy_clause_ids;
  const flags = value.sensitivity_flags;
  if (
    !includes(RECOMMENDATIONS, recommendation) ||
    !includes(NEXT_ACTIONS, nextAction) ||
    !(questionCode === null || includes(Object.keys(ABSENCE_QUESTION_TEXT) as AbsenceQuestionCode[], questionCode)) ||
    !Array.isArray(policies) || policies.length < 1 || policies.length > 4 ||
    !policies.every((item) => includes(POLICY_CODES, item)) ||
    !Array.isArray(flags) || flags.length > 4 || !flags.every((item) => includes(SENSITIVITY_FLAGS, item)) ||
    typeof value.admin_summary !== "string" || value.admin_summary.length < 10 || value.admin_summary.length > 500 ||
    typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1 ||
    typeof outer.prompt_id !== "string" || typeof outer.prompt_version !== "string"
  ) return null;
  if ((nextAction === "pending_admin") !== (questionCode === null)) return null;
  if (nextAction === "request_evidence" && questionCode !== "OFFICIAL_DOCUMENT" && questionCode !== "MEDICAL_DOCUMENT") return null;
  return {
    recommendation,
    nextAction,
    questionCode,
    policyClauseIds: policies,
    sensitivityFlags: flags,
    adminSummary: value.admin_summary.trim(),
    confidence: value.confidence,
    promptId: outer.prompt_id,
    promptVersion: outer.prompt_version,
    modelLabel: typeof outer.model_label === "string" ? outer.model_label.slice(0, 180) : null,
    validationStatus: outer.validation_status === "valid" ? "valid" : "fallback",
  };
}

export async function triageAbsence(caseFacts: string, priorAnswers: string): Promise<AbsenceTriage> {
  const argument = Buffer.from(JSON.stringify({ case_facts: caseFacts, prior_answers: priorAnswers }), "utf8")
    .toString("base64url");
  const process = await runPython("services/rag-tools/absence_triage.py", [argument], 95_000);
  if (!process.ok) return fallback();
  return validateEnvelope(parseJsonLine<BridgeEnvelope>(process.stdout)) ?? fallback();
}
