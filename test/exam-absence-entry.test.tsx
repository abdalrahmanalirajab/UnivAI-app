import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time")>();
  return { ...actual, useVirtualClock: () => new Date("2026-08-16T12:00:00.000Z") };
});

import ExamsPage from "@/app/exams/page";

describe("missed quiz appeal entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => Response.json({
      exams: [
        {
          kind: "quiz",
          week: 3,
          title: "Week 3 quiz",
          opensAt: "2026-08-12T10:00:00.000Z",
          closesAt: "2026-08-13T10:00:00.000Z",
          state: "missed",
          score: null,
          maxScore: null,
          flagged: false,
          feedback: null,
          report: null,
        },
      ],
      final: null,
      finalWindow: null,
      finalCase: null,
    })) as unknown as typeof fetch;
  });

  it("links a missed weekly quiz to its exact appeal target", async () => {
    const user = userEvent.setup();
    render(<ExamsPage />);

    await user.click(await screen.findByRole("button", { name: /all assessments/i }));
    const appeal = screen.getByRole("link", { name: "Appeal absence" });
    expect(appeal.getAttribute("href")).toBe("/absences?itemType=quiz&week=3");
  });
});
