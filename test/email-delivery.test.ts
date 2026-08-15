import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "re_test_secret",
    EMAIL_FROM: "UnivAI <noreply@example.test>",
  },
}));

import { sendEmail } from "@/lib/email";

describe("email delivery", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("passes the stable idempotency key to Resend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "provider-message-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({
      to: "student@example.test",
      subject: "Course ready",
      text: "Open your course.",
      idempotencyKey: "univai/message-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "univai/message-1" }),
      }),
    );
  });

  it("prints an obvious auth-link banner even when provider delivery succeeds", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "provider-message-2" })),
    );

    await sendEmail({
      to: "student@example.test",
      subject: "Verify your UnivAI email",
      text: "Open http://localhost:3100/verify?token=copy-me",
      terminalPreview: true,
    });

    const output = JSON.stringify(log.mock.calls);
    expect(output).toContain("UNIVAI AUTH EMAIL - COPY THE LINK BELOW");
    expect(output).toContain("token=copy-me");
  });

  it("does not include a provider response body in thrown errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("recipient=private@example.test secret=re_private", { status: 500 }),
      ),
    );

    await expect(
      sendEmail({ to: "private@example.test", subject: "X", text: "Y" }),
    ).rejects.toThrow("Email provider request failed (500).");
  });
});
