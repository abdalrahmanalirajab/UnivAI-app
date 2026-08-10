import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TranscriptReview from "@/app/lecture/[id]/TranscriptReview";

describe("lecture speech review", () => {
  it("offers type, retry, and cancel after no speech", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onCancel = vi.fn();

    render(
      <TranscriptReview
        transcript=""
        onSend={() => undefined}
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("button", { name: "Ask the lecturer" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Try microphone again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sends only the learner-confirmed transcript", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <TranscriptReview
        transcript="What is a vector?"
        onSend={onSend}
        onRetry={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const field = screen.getByRole("textbox", { name: "Your question" });
    await user.clear(field);
    await user.type(field, "What is an embedding?");
    await user.click(screen.getByRole("button", { name: "Ask the lecturer" }));
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("What is an embedding?");
  });
});
