import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { RESEND_API_KEY: "", EMAIL_FROM: "UnivAI <noreply@example.test>" },
}));

import { sendEmail } from "@/lib/email";

describe("email delivery without a provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prints the full auth message for local link testing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const message = {
      to: "learner@example.test",
      subject: "Verify your UnivAI email",
      text: "Confirm your email:\nhttp://localhost:3100/api/auth/verify-email?token=test-token",
    };

    await expect(sendEmail(message)).resolves.toBe("skipped");

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain(message.to);
    expect(logged).toContain(message.subject);
    expect(logged).toContain("token=test-token");
  });

  it("keeps durable jobs retryable and still prints fallback messages in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
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
    expect(logged).toContain(privateMessage.to);
    expect(logged).toContain(privateMessage.subject);
    expect(logged).toContain(privateMessage.text);
  });
});
