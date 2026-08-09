import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOnboardingState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/onboarding", () => ({
  getOnboardingState: mocks.getOnboardingState,
}));

import UploadLayout from "@/app/upload/layout";
import {
  requireVerifiedUser,
  requireVerifiedUserApi,
} from "@/lib/session";

const user = {
  id: "user-22",
  name: "Unverified Learner",
  email: "learner@example.test",
  emailVerified: false,
  phone: null,
  role: "student",
  registrationNumber: "S-2026-000022",
  image: null,
  createdAt: "2026-08-04T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  });
  mocks.getSession.mockResolvedValue({ user });
  mocks.getOnboardingState.mockResolvedValue({
    emailVerified: true,
    hasPreparedSource: false,
  });
});

describe("verified session guards", () => {
  it("redirects an unverified upload page before onboarding or UI rendering", async () => {
    await expect(
      UploadLayout({ children: <div>Upload form</div> }),
    ).rejects.toThrow("NEXT_REDIRECT:/verify-email");

    expect(mocks.redirect).toHaveBeenCalledWith("/verify-email");
    expect(mocks.getOnboardingState).not.toHaveBeenCalled();
  });

  it("allows a verified first-time learner to reach the upload page", async () => {
    const verified = { ...user, emailVerified: true };
    mocks.getSession.mockResolvedValue({ user: verified });

    const content = <div>Upload form</div>;
    await expect(UploadLayout({ children: content })).resolves.toBe(content);
    expect(mocks.getOnboardingState).toHaveBeenCalledWith(verified);
  });

  it("preserves the anonymous page redirect with its return path", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireVerifiedUser("/upload")).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirect=%2Fupload",
    );
  });

  it("returns the required API status for anonymous, unverified, and verified users", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const anonymous = await requireVerifiedUserApi();
    expect(anonymous).toBeInstanceOf(Response);
    expect((anonymous as Response).status).toBe(401);

    mocks.getSession.mockResolvedValueOnce({ user });
    const unverified = await requireVerifiedUserApi();
    expect(unverified).toBeInstanceOf(Response);
    expect((unverified as Response).status).toBe(403);
    expect(await (unverified as Response).json()).toEqual({
      error: "Verify your email to use this feature.",
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    const verified = { ...user, emailVerified: true };
    mocks.getSession.mockResolvedValueOnce({ user: verified });
    await expect(requireVerifiedUserApi()).resolves.toEqual(verified);
  });
});
