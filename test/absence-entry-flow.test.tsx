import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigation = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import AbsencesPage from "@/app/absences/page";

const eligibleLecture = {
  itemType: "lecture",
  week: 2,
  title: "Week 2 lecture — Search and planning",
  lecturePublicId: "2f7392f0-8038-45dc-92a1-edf78c04b940",
};

function learnerCase(options: { attachmentRequested: boolean; evidenceAttached?: boolean }) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "needs_clarification",
    reason: "I was unable to attend during the scheduled lecture window.",
    waitingOn: "learner",
    questionCode: null,
    question: "Which dates and times were you unable to attend?",
    outcome: null,
    decisionReason: null,
    submittedAt: "2026-08-16T10:00:00.000Z",
    decidedAt: null,
    items: [{
      itemType: "lecture",
      week: 2,
      remedy: "pending",
      lecturePublicId: eligibleLecture.lecturePublicId,
    }],
    messages: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      actor: "admin",
      message: "Which dates and times were you unable to attend?",
      responseRequested: true,
      attachmentRequested: options.attachmentRequested,
      createdAt: "2026-08-16T11:00:00.000Z",
    }],
    pendingRequest: {
      messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      question: "Which dates and times were you unable to attend?",
      attachmentRequested: options.attachmentRequested,
      evidenceAttached: options.evidenceAttached ?? false,
    },
    evidenceCount: options.evidenceAttached ? 1 : 0,
  };
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("absence appeal entry flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.search = "";
  });

  it("keeps the history page free of an appeal reason field", async () => {
    globalThis.fetch = vi.fn(async () => response({ cases: [], eligibleItems: [] }));

    render(<AbsencesPage />);

    expect(await screen.findByText("You have not submitted an absence case.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /why were you absent/i })).toBeNull();
    expect(screen.getByText(/open a lecture marked absent or a quiz marked missed/i)).toBeTruthy();
  });

  it("opens one exact eligible lecture appeal without a general item picker", async () => {
    navigation.search = "itemType=lecture&week=2";
    globalThis.fetch = vi.fn(async () =>
      response({ cases: [], eligibleItems: [eligibleLecture] }),
    );

    render(<AbsencesPage />);

    expect(await screen.findByRole("textbox", { name: /why were you absent/i })).toBeTruthy();
    expect(screen.getByText("Week 2 lecture — Search and planning")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("submits only the missed item encoded by the trusted entry link", async () => {
    navigation.search = "itemType=lecture&week=2";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.method === "POST") {
        return response({ case: { id: "case-1" } }, 201);
      }
      return response({ cases: [], eligibleItems: [eligibleLecture] });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<AbsencesPage />);
    const reason = await screen.findByRole("textbox", { name: /why were you absent/i });
    await user.type(reason, "I was admitted to hospital during the lecture window.");
    await user.click(screen.getByRole("button", { name: /submit for strict review/i }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/absences"));
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      reason: "I was admitted to hospital during the lecture window.",
      items: [{ itemType: "lecture", week: 2 }],
    });
  });

  it("does not expose the reason field for an ineligible deep link", async () => {
    navigation.search = "itemType=lecture&week=99";
    globalThis.fetch = vi.fn(async () => response({ cases: [], eligibleItems: [] }));

    render(<AbsencesPage />);

    expect(await screen.findByText("This item cannot be appealed")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /why were you absent/i })).toBeNull();
  });

  it("never renders a file input for an admin request marked text-only", async () => {
    globalThis.fetch = vi.fn(async () => response({
      cases: [learnerCase({ attachmentRequested: false })],
      eligibleItems: [],
    }));

    const { container } = render(<AbsencesPage />);

    expect(await screen.findByText(/administrator did not authorize an image/i)).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your reply" })).toBeTruthy();
  });

  it("renders one file input only when the latest admin question requires an image", async () => {
    globalThis.fetch = vi.fn(async () => response({
      cases: [learnerCase({ attachmentRequested: true })],
      eligibleItems: [],
    }));

    const { container } = render(<AbsencesPage />);

    expect(await screen.findByText("Attach requested JPEG or PNG")).toBeTruthy();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(
      (screen.getByRole("button", { name: "Send reply to administrator" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
