import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdminNotificationMonitor from "@/app/admin/AdminNotificationMonitor";

function monitorResponse(page: number) {
  return {
    registrationNumber: null,
    summary: {
      queued: 21,
      retrying: 0,
      processing: 0,
      submitted: 0,
      failed: 0,
      skipped: 0,
    },
    notifications: [],
    pagination: { page, pageSize: 10, total: 21, pages: 3 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin email delivery pagination", () => {
  it("requests the selected server page and exposes first and last page controls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      return Response.json(monitorResponse(Number(url.searchParams.get("page") ?? "1")));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AdminNotificationMonitor />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/notifications?page=1&pageSize=10",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    expect(screen.getByRole("button", { name: /first page/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /last page/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/notifications?page=2&pageSize=10",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
