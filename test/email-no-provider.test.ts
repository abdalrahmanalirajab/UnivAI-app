import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { RESEND_API_KEY: "", EMAIL_FROM: "UnivAI <noreply@example.test>" },
}));

import { sendEmail } from "@/lib/email";

describe("email delivery without a provider", () => {
  it("keeps durable jobs retryable and never logs private message data", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const privateMessage = {
      to: "private@example.test",
      subject: "Private result",
      text: "A private grade and one-time token",
    };

    await expect(sendEmail({ ...privateMessage, requireDelivery: true })).rejects.toThrow(
      "not configured",
    );
    await sendEmail(privateMessage);

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(privateMessage.to);
    expect(logged).not.toContain(privateMessage.subject);
    expect(logged).not.toContain(privateMessage.text);
    log.mockRestore();
  });
});
