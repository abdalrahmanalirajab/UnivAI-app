import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import RaiseHandDock from "@/app/lecture/[id]/RaiseHandDock";

expect.extend(toHaveNoViolations);

declare module "vitest" {
  // Mirrors Vitest's declaration; jest-axe does not currently ship this type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toHaveNoViolations(): T;
  }
}

const handlers = {
  onRaiseHand: vi.fn(),
  onToggleMute: vi.fn(),
  onRetry: vi.fn(),
  onCancel: vi.fn(),
  onSend: vi.fn(),
};

describe("raise-hand dock accessibility", () => {
  it("has no automated violations in its compact idle state", async () => {
    render(
      <main>
        <RaiseHandDock
          connected
          micBlocked={false}
          mic={null}
          muted
          hand="idle"
          agentState="lecturing"
          speechState={null}
          speechDetail={null}
          problem={null}
          progressDetail={null}
          transcript={null}
          answers={[]}
          answerOutput={null}
          metadataMessage={null}
          {...handlers}
        />
      </main>,
    );

    expect(await axe(document.body)).toHaveNoViolations();
  }, 20_000);

  it("has no automated violations in transcript review", async () => {
    render(
      <main>
        <RaiseHandDock
          connected
          micBlocked={false}
          mic={null}
          muted
          hand="acked"
          agentState="review"
          speechState="received"
          speechDetail="Transcript ready. Check it before sending."
          problem={null}
          progressDetail={null}
          transcript="What is a collision?"
          answers={[]}
          answerOutput={null}
          metadataMessage={null}
          {...handlers}
        />
      </main>,
    );

    expect(await axe(document.body)).toHaveNoViolations();
  }, 20_000);
});
