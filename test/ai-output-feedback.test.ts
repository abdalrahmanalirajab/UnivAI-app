import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: mockQuery, queryOne: mockQueryOne }));

import {
  parseAiOutputFeedbackRequest,
  submitAiOutputFeedback,
} from "@/lib/ai-output-feedback";

const TARGET = {
  target_type: "section",
  target_id: "7f1e8ca0-9c4c-44aa-9332-ae5bb46868a1",
  target_version: "a".repeat(64),
  trace_id: `section:7f1e8ca0-9c4c-44aa-9332-ae5bb46868a1:${"a".repeat(64)}`,
};

describe("AI output feedback contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  it("supports only like and report actions", () => {
    expect(parseAiOutputFeedbackRequest({ ...TARGET, action: "rating", rating: 5 })).toEqual({
      ok: false,
      error: "action must be like or report.",
    });
    expect(parseAiOutputFeedbackRequest({ ...TARGET, action: "like", liked: true })).toMatchObject({
      ok: true,
      value: { action: "like", liked: true, targetType: "section" },
    });
  });

  it("requires a predefined report reason and keeps detail optional", () => {
    expect(parseAiOutputFeedbackRequest({ ...TARGET, action: "report", reason: "made_up" })).toEqual({
      ok: false,
      error: "Choose a valid report reason.",
    });
    expect(parseAiOutputFeedbackRequest({
      ...TARGET,
      action: "report",
      reason: "incorrect",
    })).toMatchObject({ ok: true, value: { action: "report", detail: null } });
  });

  it("ownership-validates the target and rejects stale version metadata", async () => {
    mockQueryOne.mockResolvedValueOnce({
      section_pack_id: TARGET.target_id,
      payload_hash: "b".repeat(64),
    });
    const parsed = parseAiOutputFeedbackRequest({ ...TARGET, action: "like", liked: true });
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await submitAiOutputFeedback("S-2026-000001", parsed.value);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "This generated output version is no longer current.",
    });
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
  });

  it("upserts a report only after ownership and metadata match", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ section_pack_id: TARGET.target_id, payload_hash: "a".repeat(64) })
      .mockResolvedValueOnce({ id: 12, reason: "technical_issue", status: "pending" });
    const parsed = parseAiOutputFeedbackRequest({
      ...TARGET,
      action: "report",
      reason: "technical_issue",
      detail: "Slides stop early.",
    });
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await submitAiOutputFeedback("S-2026-000001", parsed.value);

    expect(result).toEqual({
      ok: true,
      value: { report: { id: 12, reason: "technical_issue", status: "pending" } },
    });
    expect(mockQueryOne.mock.calls[1][0]).toContain("INSERT INTO ai_output_reports");
    expect(mockQueryOne.mock.calls[1][1]).toContain("Slides stop early.");
  });
});
