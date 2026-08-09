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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
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
