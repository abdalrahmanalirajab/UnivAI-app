import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("shows only Like and Report feedback actions", () => {
    render(<OutputFeedback target={TARGET} />);

    expect(screen.getByRole("button", { name: "Like" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/rating/i)).toBeNull();
  });

  it("submits a Like and then hides both feedback actions", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ reaction: { id: 1 } }));
    const user = userEvent.setup();
    render(<OutputFeedback target={TARGET} />);

    const like = screen.getByRole("button", { name: "Like" });
    await user.click(like);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody(fetchMock)).toMatchObject({ action: "like", liked: true });
    expect(screen.queryByRole("button", { name: "Like" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(await screen.findByText("Thanks — you liked this output.")).toBeTruthy();
  });

  it("submits a required predefined report reason", async () => {
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
    expect(screen.queryByRole("button", { name: "Like" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  }, 15_000);

  it("regenerates only a raised-hand answer and charges the displayed Credits", async () => {
    const regeneratedOutput = { id: 8, status: "ready" };
    const regeneratedTurn = { qaId: 8, answer: "A new grounded answer." };
    const onRegenerated = vi.fn();
    const fetchMock = mockFetchEndpoint(() => ({
      output: regeneratedOutput,
      turn: regeneratedTurn,
    }));
    const user = userEvent.setup();
    render(<OutputFeedback target={TARGET} onRegenerated={onRegenerated} />);

    await user.click(screen.getByRole("button", { name: /Regenerate.*15 Credits/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/answers/17/regenerate");
    expect(onRegenerated).toHaveBeenCalledWith(regeneratedTurn, regeneratedOutput);
    expect(await screen.findByText("Answer regenerated for 15 Credits.")).toBeTruthy();
  });

  it("renders an explicit unavailable state when no target or retry exists", () => {
    render(<OutputFeedback />);
    expect(screen.getByText(/feedback is unavailable/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
