import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminActionInbox from "@/app/admin/AdminActionInbox";

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function caseDetail(waitingOn: "admin" | "learner") {
  return {
    id: CASE_ID,
    student: {
      registrationNumber: "S-2026-000001",
      name: "Learner One",
      email: "learner@example.test",
    },
    status: waitingOn === "admin" ? "pending_admin" : "needs_clarification",
    waitingOn,
    reason: "I was unable to attend during the scheduled lecture window.",
    recommendation: "human_review",
    suggestedQuestion: null,
    policyClauseIds: [],
    sensitivityFlags: [],
    adminSummary: "A human must review the learner statement.",
    aiConfidence: 0.5,
    items: [{ itemType: "lecture", week: 2, remedy: "pending" }],
    messages: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        actor: "learner",
        message: "I was unable to attend during the scheduled lecture window.",
        responseRequested: false,
        attachmentRequested: false,
        createdAt: "2026-08-16T10:00:00.000Z",
      },
      ...(waitingOn === "learner" ? [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        actor: "admin",
        message: "Please explain the exact dates and include the official notice.",
        responseRequested: true,
        attachmentRequested: true,
        createdAt: "2026-08-16T11:00:00.000Z",
      }] : []),
    ],
    evidence: [],
  };
}

describe("admin absence conversation UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the admin request text plus an attachment, then waits for the learner", async () => {
    let waitingOn: "admin" | "learner" = "admin";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url === "/api/admin/actions") {
        return Response.json({
          actions: [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            caseId: CASE_ID,
            studentId: "S-2026-000001",
            studentName: "Learner One",
            title: waitingOn === "admin"
              ? "Absence case requires review"
              : "Waiting for learner information",
            safeSummary: "Protected case review.",
            priority: "normal",
            status: waitingOn === "admin" ? "pending" : "assigned",
            waitingOn,
            createdAt: "2026-08-16T10:00:00.000Z",
          }],
        });
      }
      if (url === `/api/admin/absence-cases/${CASE_ID}` && init.method === "PATCH") {
        waitingOn = "learner";
        return Response.json({ case: caseDetail(waitingOn) });
      }
      if (url === `/api/admin/absence-cases/${CASE_ID}`) {
        return Response.json({ case: caseDetail(waitingOn) });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    render(<AdminActionInbox />);

    fireEvent.click(await screen.findByRole("button", { name: "Review case" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Question shown to learner" }),
      { target: { value: "Please explain the exact dates and include the official notice." } },
    );
    fireEvent.click(screen.getByRole("checkbox", {
      name: /require one JPEG or PNG image/i,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Send question to learner" }));

    await waitFor(() => expect(screen.getByText("Waiting for the learner")).toBeTruthy());
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      action: "request_information",
      question: "Please explain the exact dates and include the official notice.",
      attachmentRequested: true,
    });
    expect(screen.queryByRole("button", { name: "Record final decision" })).toBeNull();
  });
});
