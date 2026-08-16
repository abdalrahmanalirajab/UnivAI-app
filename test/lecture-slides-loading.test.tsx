import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LectureSlides from "@/app/lecture/[id]/LectureSlides";

const DECK = {
  presentationId: "22222222-2222-4222-8222-222222222222",
  week: 1,
  title: "Storage engines",
  slides: [{ slide: 1, heading: "Indexes", bullets: [], page: 5 }],
};

describe("live lecture presentation loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats the trusted-join race as preparation and opens automatically", async () => {
    let request = 0;
    globalThis.fetch = vi.fn(async () => {
      request += 1;
      if (request === 1) {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            code: "PRESENTATION_LOCKED",
            reason: "not_joined",
            error: "Your live lecture connection is still being confirmed.",
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ deck: DECK, mode: "live" }),
      } as Response;
    }) as unknown as typeof fetch;

    render(<LectureSlides lectureId="11111111-1111-4111-8111-111111111111" slide={1} />);

    expect(screen.getByText("Preparing your presentation…")).not.toBeNull();
    expect(screen.queryByText(/Join the live lecture/i)).toBeNull();
    expect(await screen.findByText("Confirming your lecture access…")).not.toBeNull();
    expect(
      await screen.findByTitle("Week 1: Storage engines", {}, { timeout: 2_000 }),
    ).not.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
