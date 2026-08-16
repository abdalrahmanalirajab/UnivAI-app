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
});
