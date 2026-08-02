import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SourcePanel from "@/app/components/SourcePanel";
import type { CitationV1 } from "@/test/fixtures/citation-v1";

function citation(overrides: Partial<CitationV1> = {}): CitationV1 {
  return {
    documentId: 7,
    bookTitle: "Introduction to Algorithms",
    pages: [{ page: 12 }],
    excerpt: "The quicksort algorithm sorts in place, using O(log n) stack space.",
    ...overrides,
  };
}

describe("SourcePanel — real citation", () => {
  it("renders book, page reference, and excerpt for a resolvable citation", () => {
    render(<SourcePanel citation={citation()} />);

    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Introduction to Algorithms")).toBeTruthy();
    expect(screen.getByText("p. 12")).toBeTruthy();
    expect(
      screen.getByText(
        "The quicksort algorithm sorts in place, using O(log n) stack space.",
      ),
    ).toBeTruthy();
  });

  it("renders a multi-page reference for several page entries", () => {
    render(
      <SourcePanel
        citation={citation({ pages: [{ page: 12 }, { page: 14 }, { page: 15 }] })}
      />,
    );

    expect(screen.getByText("pp. 12, 14, 15")).toBeTruthy();
  });

  it("rejects a citation without a database-backed source identity", () => {
    render(<SourcePanel citation={citation({ documentId: null, bookTitle: null })} />);
    expect(screen.getByText(/source unavailable/i)).toBeTruthy();
    expect(screen.queryByText("p. 12")).toBeNull();
  });

  it("shows an honest fallback when the source excerpt is absent", () => {
    render(<SourcePanel citation={citation({ excerpt: null })} />);
    expect(screen.getByText("Introduction to Algorithms")).toBeTruthy();
    expect(screen.getByText("Excerpt unavailable")).toBeTruthy();
  });

  it("renders the close control only when onClose is provided", () => {
    const onClose = () => {};
    const { unmount } = render(<SourcePanel citation={citation()} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    unmount();

    render(<SourcePanel citation={citation()} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("SourcePanel — source unavailable state", () => {
  it("renders the explicit unavailable state for a missing citation", () => {
    render(<SourcePanel citation={null} />);

    expect(
      screen.getByText("Source unavailable — no citation data was produced for this answer."),
    ).toBeTruthy();
    expect(screen.queryByText("Book")).toBeNull();
  });

  it.each([
    ["empty pages", { pages: [] }],
    ["zero page number", { pages: [{ page: 0 }] }],
    ["negative page number", { pages: [{ page: -3 }] }],
    ["fractional page number", { pages: [{ page: 1.5 }] }],
  ])("renders the explicit unavailable state for malformed pages — %s", (_label, malformed) => {
    render(<SourcePanel citation={citation(malformed)} />);

    expect(
      screen.getByText("Source unavailable — no citation data was produced for this answer."),
    ).toBeTruthy();
    expect(screen.queryByText("Book")).toBeNull();
    expect(screen.queryByText(/^p{1,2}\./)).toBeNull();
  });
});
