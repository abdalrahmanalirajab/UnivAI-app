import { describe, expect, it, vi } from "vitest";

import { loadLiveAnswerMetadata } from "@/lib/live-answer-metadata";

function response(status: number, body: object) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("live answer metadata synchronization", () => {
  it("waits through the qa_log race and returns the eventual output", async () => {
    const output = { id: 17, status: "ready" };
    const request = vi.fn()
      .mockResolvedValueOnce(response(404, { error: "not recorded yet" }))
      .mockResolvedValueOnce(response(404, { error: "not recorded yet" }))
      .mockResolvedValueOnce(response(200, { output }));

    const result = await loadLiveAnswerMetadata("lecture-id", {
      request,
      pause: async () => undefined,
      retryDelaysMs: [0, 1, 1],
    });

    expect(result).toMatchObject({ state: "ready", output });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("reports a persistent 404 as syncing, not failed", async () => {
    const result = await loadLiveAnswerMetadata("lecture-id", {
      request: vi.fn().mockResolvedValue(response(404, {})),
      pause: async () => undefined,
      retryDelaysMs: [0, 1],
    });

    expect(result.state).toBe("syncing");
    expect(result.message ?? "").toContain("Answer delivered");
    expect((result.message ?? "").toLowerCase()).not.toContain("failed");
  });

  it("separates a metadata service error from answer delivery", async () => {
    const result = await loadLiveAnswerMetadata("lecture-id", {
      request: vi.fn().mockResolvedValue(response(503, { error: "Database unavailable" })),
      retryDelaysMs: [0],
    });

    expect(result.state).toBe("unavailable");
    expect(result.message ?? "").toMatch(/^Answer delivered\./);
    expect((result.message ?? "").toLowerCase()).not.toContain("generation failed");
  });
});
