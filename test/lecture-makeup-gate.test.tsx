import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
import MakeupLectureGate from "@/app/lecture/[id]/MakeupLectureGate";

describe("make-up lecture confirmation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once, then opens the normal interactive lecture room", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ makeup: { state: "active" } }),
    })) as unknown as typeof fetch;

    render(
      <MakeupLectureGate
        lectureId="11111111-1111-4111-8111-111111111111"
        week={2}
        title="Storage engines"
        initialState="ready"
        activeRoom={<div>interactive-live-room</div>}
      />,
    );

    expect(screen.getByText("Confirm your one-time start")).not.toBeNull();
    expect(screen.getByText(/raise your hand and ask questions/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start now" }));

    expect(await screen.findByText("interactive-live-room")).not.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/lecture/11111111-1111-4111-8111-111111111111/makeup/start",
      { method: "POST" },
    );
  });

  it("never offers another start after completion", () => {
    render(
      <MakeupLectureGate
        lectureId="11111111-1111-4111-8111-111111111111"
        week={2}
        title="Storage engines"
        initialState="completed"
        activeRoom={<div>interactive-live-room</div>}
      />,
    );

    expect(screen.getByText("Make-up completed")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm and start now" })).toBeNull();
  });
});
