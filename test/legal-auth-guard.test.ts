import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: string;
    body: { code?: string; message?: string };

    constructor(status: string, body: { code?: string; message?: string }) {
      super(body.message);
      this.status = status;
      this.body = body;
    }
  }
  return {
    findUserByEmail: vi.fn(),
    getSessionFromCtx: vi.fn(),
    MockApiError,
  };
});

vi.mock("better-auth/api", () => ({
  APIError: mocks.MockApiError,
  createAuthMiddleware: (handler: (context: unknown) => unknown) => handler,
  getSessionFromCtx: mocks.getSessionFromCtx,
}));

import { guardHook } from "@/lib/auth-guards";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from "@/lib/legal-documents";

const acceptedBody = {
  name: "Learner Name",
  email: "learner@example.test",
  eulaAccepted: true,
  eulaVersion: CURRENT_EULA_VERSION,
  privacyNoticeAcknowledged: true,
  privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
  uiLocale: "en",
};

function runGuard(body: Record<string, unknown>) {
  return (
    guardHook as unknown as (context: {
      path: string;
      body: Record<string, unknown>;
      context: { internalAdapter: Record<string, unknown> };
    }) => Promise<void>
  )({
    path: "/sign-up/email",
    body,
    context: {
      internalAdapter: {
        findUserByEmail: mocks.findUserByEmail,
        findUserById: vi.fn(),
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUserByEmail.mockResolvedValue(null);
});

describe("email signup legal guard", () => {
  it.each([
    ["missing acceptance", { ...acceptedBody, eulaAccepted: false }],
    ["stale EULA", { ...acceptedBody, eulaVersion: "old" }],
    ["missing privacy acknowledgment", { ...acceptedBody, privacyNoticeAcknowledged: false }],
    ["stale Privacy Notice", { ...acceptedBody, privacyNoticeVersion: "old" }],
    ["unsupported locale", { ...acceptedBody, uiLocale: "fr" }],
  ])("rejects %s before looking up an email", async (_label, body) => {
    await expect(runGuard(body)).rejects.toMatchObject({
      status: "UNPROCESSABLE_ENTITY",
      body: { code: "LEGAL_ACCEPTANCE_REQUIRED" },
    });
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
  });

  it("allows a current acceptance to proceed to the existing account check", async () => {
    await expect(runGuard(acceptedBody)).resolves.toBeUndefined();
    expect(mocks.findUserByEmail).toHaveBeenCalledWith("learner@example.test");
  });

  it("preserves duplicate-account protection after legal validation", async () => {
    mocks.findUserByEmail.mockResolvedValue({ user: { id: "existing" } });
    await expect(runGuard(acceptedBody)).rejects.toMatchObject({
      status: "UNPROCESSABLE_ENTITY",
      body: { code: "USER_ALREADY_EXISTS" },
    });
  });

  it.each(["Learner2", "Sara🙂", "Anne-Marie", "محمد١"])(
    "rejects a non-letter account name: %s",
    async (name) => {
      await expect(runGuard({ ...acceptedBody, name })).rejects.toMatchObject({
        status: "UNPROCESSABLE_ENTITY",
        body: { code: "INVALID_USER_NAME" },
      });
      expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    },
  );

  it("normalizes valid name whitespace before account creation", async () => {
    const body = { ...acceptedBody, name: "  محمد\tهاني  " };
    await runGuard(body);
    expect(body.name).toBe("محمد هاني");
  });
});

describe("profile name guard", () => {
  it("rejects direct update-user requests that bypass the profile form", async () => {
    await expect(
      (
        guardHook as unknown as (context: {
          path: string;
          body: Record<string, unknown>;
          context: { internalAdapter: Record<string, unknown> };
        }) => Promise<void>
      )({
        path: "/update-user",
        body: { name: "Student_7" },
        context: { internalAdapter: {} },
      }),
    ).rejects.toMatchObject({
      status: "UNPROCESSABLE_ENTITY",
      body: { code: "INVALID_USER_NAME" },
    });
  });
});
