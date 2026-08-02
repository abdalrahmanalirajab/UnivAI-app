import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
 * Test data follows issue rule 8: citations carry only what has a real
 * producer today — pages from the script.json shape — while bookTitle and
 * excerpt stay null, so the explicit "unavailable" states are what gets
 * rendered and checked, never a fabricated source identity.
 *
 * axe() is slow in jsdom, hence the per-test timeouts.
 */

const resolvableCitation: CitationV1 = {
  documentId: null,
  bookTitle: null,
  pages: [{ page: 2 }, { page: 5 }],
  excerpt: null,
};

describe("primary lecture-viewing + citation flow", () => {
  it("transcript review with citations has no violations", async () => {
    // The flow renders inside the app's <main> landmark in production
    // (AppMain.tsx), so the harness mirrors that real containment.
    render(
      <main>
        <TranscriptReview
          transcript="What is a covalent bond?"
          citations={[resolvableCitation]}
          onSend={() => undefined}
          onCancel={() => undefined}
        />
      </main>
    );

    expect(await axe(document.body)).toHaveNoViolations();
  }, 20000);

  it("opening the citation panel (drawer + source dialog) has no violations", async () => {
    const user = userEvent.setup();
    render(
      <main>
        <TranscriptReview
          transcript="What is a covalent bond?"
          citations={[resolvableCitation]}
          onSend={() => undefined}
          onCancel={() => undefined}
        />
      </main>
    );

    const bubble = screen.getByRole("button", { name: /open source pp\. 2, 5/i });
    await user.click(bubble);

    // The Drawer paper (aria-label "Source") and the SourcePanel card are
    // both named dialogs; the panel is nested inside the drawer.
    expect(screen.getAllByRole("dialog", { name: /source/i }).length).toBeGreaterThanOrEqual(1);
    expect(bubble.getAttribute("aria-expanded")).toBe("false");
    expect(await axe(document.body)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryAllByRole("dialog", { name: /source/i }).length).toBe(0);
    });
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
        <OutputFeedback outputVersion="1.0.0" traceId="trace-1" bookId={3} />
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
