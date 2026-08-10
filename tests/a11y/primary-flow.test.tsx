import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import TranscriptReview from "@/app/lecture/[id]/TranscriptReview";
import CitationBubble from "@/app/components/CitationBubble";
import SourcePanel from "@/app/components/SourcePanel";
import OutputFeedback from "@/app/components/OutputFeedback";
import GenerationStatus from "@/app/components/GenerationStatus";
import type { CitationV1 } from "@/test/fixtures/citation-v1";

expect.extend(toHaveNoViolations);

/* jest-axe v11 ships no type declarations (see test/a11y/jest-axe.d.ts);
   the matcher is added to vitest's Assertion here. */
declare module "vitest" {
  // Mirrors vitest's own Assertion<T = any> declaration (TS2428 requires
  // identical type parameters), hence the explicit any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toHaveNoViolations(): T;
  }
}

/**
 * Automated accessibility checks over the primary lecture-viewing + citation
 * + feedback flow, using jest-axe (real dependency — added for this step).
 *
 * Test data mirrors the database-backed source identity returned by the
 * output metadata endpoint.
 *
 * axe() is slow in jsdom, hence the per-test timeouts.
 */

const resolvableCitation: CitationV1 = {
  documentId: 3,
  bookTitle: "Chemistry Fundamentals",
  pages: [{ page: 2 }, { page: 5 }],
  excerpt: "A covalent bond shares electrons between atoms.",
};

describe("primary lecture-viewing + citation flow", () => {
  it("transcript review with citations has no violations", async () => {
    // The flow renders inside the app's <main> landmark in production
    // (AppMain.tsx), so the harness mirrors that real containment.
    render(
      <main>
        <TranscriptReview
          transcript="What is a covalent bond?"
          onSend={() => undefined}
          onRetry={() => undefined}
          onCancel={() => undefined}
        />
      </main>
    );

    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("opening the citation panel (drawer + source dialog) has no violations", async () => {
    render(
      <main>
        <CitationBubble citation={resolvableCitation} expanded onOpen={() => undefined} />
        <SourcePanel citation={resolvableCitation} onClose={() => undefined} />
      </main>
    );

    const bubble = screen.getByRole("button", { name: /open source pp\. 2, 5/i });
    expect(screen.getByRole("dialog", { name: /source/i })).toBeTruthy();
    expect(bubble.getAttribute("aria-expanded")).toBe("true");
    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("standalone citation bubble renders both states without violations", async () => {
    render(
      <main>
        <CitationBubble citation={resolvableCitation} onOpen={() => undefined} />
        <CitationBubble citation={null} onOpen={() => undefined} />
      </main>
    );

    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("source panel unavailable state has no violations", async () => {
    render(
      <main>
        <SourcePanel citation={null} />
      </main>
    );

    expect(await axe(document.body)).toHaveNoViolations();
    expect(screen.getByText(/source unavailable/i)).toBeTruthy();
  }, 20000);
});

describe("feedback flow", () => {
  it("full feedback controls have no violations", async () => {
    render(
      <main>
        <OutputFeedback outputId={1} outputVersion="1" traceId="trace-1" bookId={3} />
      </main>
    );

    expect(screen.getByRole("button", { name: "Thumbs up" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thumbs down" })).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("feedback without identifiers renders the explicit unavailable state", async () => {
    render(
      <main>
        <OutputFeedback />
      </main>
    );

    expect(screen.getByText(/feedback and retry are unavailable/i)).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("generation status renders known and unknown states without violations", async () => {
    render(
      <main>
        <GenerationStatus status="ready" progress="All lectures generated." />
        <GenerationStatus status="bogus" />
      </main>
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Unknown status")).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);
});
