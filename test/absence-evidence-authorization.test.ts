import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  attachAbsenceEvidence: vi.fn(),
  enforceUserRateLimit: vi.fn(),
  getOpenAbsenceAttachmentRequest: vi.fn(),
  requireLearningActionApi: vi.fn(),
}));

vi.mock("@/lib/absence-cases", () => ({
  AbsenceCaseError: class AbsenceCaseError extends Error {},
  attachAbsenceEvidence: mocks.attachAbsenceEvidence,
  getOpenAbsenceAttachmentRequest: mocks.getOpenAbsenceAttachmentRequest,
}));
vi.mock("@/lib/rate-limits", () => ({
  enforceUserRateLimit: mocks.enforceUserRateLimit,
}));
vi.mock("@/lib/session", () => ({
  requireLearningActionApi: mocks.requireLearningActionApi,
}));

import { POST } from "@/app/api/absences/[caseId]/evidence/route";

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("absence evidence authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLearningActionApi.mockResolvedValue({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      registrationNumber: "S-2026-000001",
    });
    mocks.enforceUserRateLimit.mockResolvedValue(null);
  });

  it("rejects before reading a file when no admin-authored attachment request is open", async () => {
    mocks.getOpenAbsenceAttachmentRequest.mockResolvedValue(null);
    const request = new NextRequest(`http://localhost/api/absences/${CASE_ID}/evidence`, {
      method: "POST",
    });

    const response = await POST(request, {
      params: Promise.resolve({ caseId: CASE_ID }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "An administrator must request an attachment before you can upload one.",
      code: "ATTACHMENT_NOT_REQUESTED",
    });
    expect(mocks.attachAbsenceEvidence).not.toHaveBeenCalled();
  });
});
