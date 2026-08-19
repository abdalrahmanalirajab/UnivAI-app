import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import RaiseHandDock, {
  getRaiseHandControlPhase,
} from "@/app/lecture/[id]/RaiseHandDock";

const handlers = () => ({
  onRaiseHand: vi.fn(),
  onToggleMute: vi.fn(),
  onRetry: vi.fn(),
  onCancel: vi.fn(),
  onSend: vi.fn(),
});

type DockProps = ComponentProps<typeof RaiseHandDock>;

function props(overrides: Partial<DockProps> = {}): DockProps {
  return {
    connected: true,
    micBlocked: false,
    mic: null,
    muted: true,
    hand: "idle" as const,
    agentState: "lecturing" as const,
    speechState: null,
    speechDetail: null,
    problem: null,
    progressDetail: null,
    transcript: null,
    answers: [],
    answerOutput: null,
    metadataMessage: null,
    ...handlers(),
    ...overrides,
  };
}

describe("raise-hand transforming control", () => {
  it("maps the Live protocol to the intended visual phases", () => {
    expect(getRaiseHandControlPhase({
      agentState: "lecturing", hand: "idle", muted: true, transcript: null,
    })).toBe("idle");
    expect(getRaiseHandControlPhase({
      agentState: "asking", hand: "raised", muted: true, transcript: null,
    })).toBe("waiting");
    expect(getRaiseHandControlPhase({
      agentState: "asking", hand: "acked", muted: true, transcript: null,
    })).toBe("ready");
    expect(getRaiseHandControlPhase({
      agentState: "listening", hand: "acked", muted: false, transcript: null,
    })).toBe("recording");
    expect(getRaiseHandControlPhase({
      agentState: "processing", hand: "acked", muted: true, transcript: null,
    })).toBe("processing");
    expect(getRaiseHandControlPhase({
      agentState: "review", hand: "acked", muted: true, transcript: "question",
    })).toBe("review");
    expect(getRaiseHandControlPhase({
      agentState: "answering", hand: "acked", muted: true, transcript: null,
    })).toBe("answering");
  });

  it("starts as one raise-hand button", async () => {
    const user = userEvent.setup();
    const onRaiseHand = vi.fn();
    render(<RaiseHandDock {...props({ onRaiseHand })} />);

    await user.click(screen.getByRole("button", { name: "Raise your hand" }));
    expect(onRaiseHand).toHaveBeenCalledOnce();
  });

  it("uses a compact waiting icon with an explanatory tooltip", async () => {
    const user = userEvent.setup();
    const onToggleMute = vi.fn();
    render(
      <RaiseHandDock
        {...props({
          hand: "raised",
          agentState: "asking",
          onToggleMute,
        })}
      />,
    );

    expect(screen.queryByText("Hand raised — finishing the current sentence")).toBeNull();
    await user.hover(screen.getByRole("button", { name: "Hand raised. Lower hand" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "Hand raised. The lecturer is finishing the current sentence. Click to lower your hand.",
    );
    await user.click(screen.getByRole("button", { name: "Hand raised. Lower hand" }));
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it("hides SDK details and shows a dismissible notice without moving the control", async () => {
    const user = userEvent.setup();
    render(
      <RaiseHandDock
        {...props({
          onRaiseHand: vi.fn(async () => {
            throw new Error("The voice connection did not receive that action.");
          }),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Raise your hand" }));
    expect(await screen.findByText("The lecturer is reconnecting. Try again shortly.")).toBeTruthy();
    expect(screen.queryByText("The voice connection did not receive that action.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByText("The lecturer is reconnecting. Try again shortly.")).toBeNull();
    });
  });

  it("offers both microphone and check controls to finish recording", async () => {
    const user = userEvent.setup();
    const onToggleMute = vi.fn();
    render(
      <RaiseHandDock
        {...props({
          hand: "acked",
          agentState: "listening",
          muted: false,
          onToggleMute,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Finish recording" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Done speaking" }));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("expands in place for transcript correction and submission", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <RaiseHandDock
        {...props({
          hand: "acked",
          agentState: "review",
          speechState: "received",
          transcript: "Explain hash tables",
          onSend,
        })}
      />,
    );

    const transcript = screen.getByRole("textbox", { name: "Question transcript" });
    await user.clear(transcript);
    await user.type(transcript, "Explain chaining simply");
    await user.click(screen.getByRole("button", { name: /Ask.*2 Credits/ }));
    expect(onSend).toHaveBeenCalledWith("Explain chaining simply");
    expect((transcript as HTMLInputElement).value).toBe("Explain chaining simply");
    expect(
      (screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows a successful answer above the control and opens history on demand", async () => {
    const user = userEvent.setup();
    render(
      <RaiseHandDock
        {...props({
          answers: [{
            id: "turn-1",
            question: "What is chaining?",
            answer: "Chaining stores colliding keys together.",
            pages: [12],
            slide: 3,
          }],
          metadataMessage: "Answer delivered. Source controls are still syncing.",
        })}
      />,
    );

    expect(await screen.findByText("Chaining stores colliding keys together.")).toBeTruthy();
    await user.click(screen.getByRole("button", {
      name: "Open raise-hand conversation, 1 turn",
    }));
    await waitFor(() => {
      expect(screen.getByLabelText("Raise-hand conversation")).toBeTruthy();
    });
    expect(screen.queryByText("Failed")).toBeNull();
  });
});
