import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OutputFeedback from "@/app/components/OutputFeedback";

const OUTPUT_VERSION = "v2.3.1";
const TRACE_ID = "trace-xyz-789";
const BOOK_ID = 42;

function mockFetchEndpoint(handler: (url: string, options: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    return { ok: true, status: 200, json: async () => handler(url, options) };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function assertFeedbackBody(call: [string, RequestInit]) {
  const [url, options] = call;
  expect(url).toBe("/api/feedback");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body as string)).toEqual({
    output_version: OUTPUT_VERSION,
    trace_id: TRACE_ID,
    rating: "up",
    issue: false,
    note: null,
  });
}

describe("OutputFeedback — thumbs up", () => {
  let fetchMock: ReturnType<typeof mockFetchEndpoint>;

  beforeEach(() => {
    fetchMock = mockFetchEndpoint(() => ({ feedback: { id: 1 } }));
  });

  it("sends output_version and trace_id with rating 'up' on send", async () => {
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Thumbs up" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    assertFeedbackBody(fetchMock.mock.calls[0] as [string, RequestInit]);
  });

  it("shows the success alert when the feedback request succeeds", async () => {
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Thumbs up" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Thanks — feedback sent.")).toBeTruthy();
  });
});

describe("OutputFeedback — thumbs down", () => {
  it("sends output_version and trace_id with rating 'down' on send", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ feedback: { id: 2 } }));
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Thumbs down" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      output_version: OUTPUT_VERSION,
      trace_id: TRACE_ID,
      rating: "down",
      issue: false,
      note: null,
    });
  });
});

describe("OutputFeedback — issue flag", () => {
  it("sends output_version and trace_id with issue true when the flag is set", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ feedback: { id: 3 } }));
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: /report an issue/i }));
    await user.click(screen.getByRole("button", { name: "Thumbs up" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      output_version: OUTPUT_VERSION,
      trace_id: TRACE_ID,
      rating: "up",
      issue: true,
      note: null,
    });
  });

  it("sends issue false when the flag is not set", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ feedback: { id: 4 } }));
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Thumbs down" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string).issue).toBe(false);
  });
});

describe("OutputFeedback — retry", () => {
  it("posts the bookId to the real retry route and reflects the retry-started state", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ ok: true, bookId: BOOK_ID, status: "generating" }));
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/retry");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ bookId: BOOK_ID });

    expect(await screen.findByRole("button", { name: "Retry started" })).toBeTruthy();
    expect(
      screen.getByText("Retry started — the course is being regenerated."),
    ).toBeTruthy();
  });

  it("surfaces a retry failure from the route as an error alert", async () => {
    const fetchMock = vi.fn(async () => {
      return { ok: false, status: 409, json: async () => ({ error: "Course is already generating." }) };
    });
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    render(<OutputFeedback outputVersion={OUTPUT_VERSION} traceId={TRACE_ID} bookId={BOOK_ID} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Course is already generating.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry started" })).toBeNull();
  });
});

describe("OutputFeedback — missing identifiers", () => {
  it("renders the explicit unavailable state and makes no calls", async () => {
    const fetchMock = mockFetchEndpoint(() => ({ feedback: { id: 5 } }));
    render(<OutputFeedback />);

    expect(
      screen.getByText(
        "Feedback and retry are unavailable — this output has no recorded identifiers yet.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
