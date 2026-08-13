import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OutputFeedback from "@/app/components/OutputFeedback";
import type { AiOutputTarget } from "@/lib/ai-output-feedback-types";

const TARGET: AiOutputTarget = {
  targetType: "raise_hand_answer",
  targetId: "17",
  targetVersion: "1",
  traceId: "qa-trace-17",
};

function mockFetchEndpoint(handler: (url: string, options: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, options: RequestInit = {}) => {
    return Response.json(handler(String(input), options), { status: 200 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof mockFetchEndpoint>) {
  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(options.body as string);
}

describe("OutputFeedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves an accessible 1–5 star rating with stable target metadata", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ reaction: { id: 1 } }));
    const user = userEvent.setup();
    render(<OutputFeedback target={TARGET} />);

    fireEvent.click(screen.getByLabelText("4 stars"));
    await user.click(screen.getByRole("button", { name: "Save rating" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock)).toEqual({
      target_type: "raise_hand_answer",
      target_id: "17",
      target_version: "1",
      trace_id: "qa-trace-17",
      action: "rating",
      rating: 4,
    });
    expect(await screen.findByText("Thanks — your rating was saved.")).toBeTruthy();
  });

  it("saves Like separately and exposes its pressed state", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ reaction: { id: 1 } }));
    const user = userEvent.setup();
    render(<OutputFeedback target={TARGET} />);

    const like = screen.getByRole("button", { name: "Like" });
    expect(like.getAttribute("aria-pressed")).toBe("false");
    await user.click(like);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock)).toMatchObject({ action: "like", liked: true });
    expect(screen.getByRole("button", { name: "Liked" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("submits a required predefined report reason without requiring a rating", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ report: { id: 4 } }));
    const user = userEvent.setup();
    render(<OutputFeedback target={TARGET} />);

    await user.click(screen.getByRole("button", { name: "Report" }));
    const submit = screen.getByRole("button", { name: "Submit report" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("combobox", { name: /reason/i }));
    await user.click(await screen.findByRole("option", { name: "Copyright or privacy concern" }));
    await user.type(screen.getByLabelText("Additional detail (optional)"), "Contains private material.");
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock)).toEqual({
      target_type: "raise_hand_answer",
      target_id: "17",
      target_version: "1",
      trace_id: "qa-trace-17",
      action: "report",
      reason: "copyright_or_privacy",
      detail: "Contains private material.",
    });
    expect(await screen.findByText("Report submitted for review.")).toBeTruthy();
  }, 15_000);

  it("keeps retry available independently when a valid retry id is supplied", async () => {
    const retriedOutput = { id: 8, status: "generating" };
    const onRetried = vi.fn();
    const fetchMock = mockFetchEndpoint(() => ({ output: retriedOutput }));
    const user = userEvent.setup();
    render(<OutputFeedback retryOutputId={7} onRetried={onRetried} />);

    await user.click(screen.getByRole("button", { name: "Retry generation" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/outputs/7/retry");
    expect(onRetried).toHaveBeenCalledWith(retriedOutput);
    expect(await screen.findByRole("button", { name: "Retry started" })).toBeTruthy();
  });

  it("renders an explicit unavailable state when no target or retry exists", () => {
    render(<OutputFeedback />);
    expect(screen.getByText(/feedback is unavailable/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
