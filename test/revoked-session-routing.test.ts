import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ hasSessionCookie: true }));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: () => (mocks.hasSessionCookie ? "stale-session-cookie" : null),
}));

import { proxy } from "@/proxy";

describe("revoked session routing", () => {
  beforeEach(() => {
    mocks.hasSessionCookie = true;
  });

  it("allows the login page to validate a stale cookie instead of redirecting to /start", () => {
    const response = proxy(new NextRequest("http://localhost/login?redirect=%2Fprofile"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still sends a protected page with no cookie to login", () => {
    mocks.hasSessionCookie = false;
    const response = proxy(new NextRequest("http://localhost/profile"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fprofile",
    );
  });

  it.each([
    "/legal",
    "/legal/privacy?lang=en",
    "/legal/eula?lang=en",
  ])("allows anonymous access to the legal page %s", (path) => {
    mocks.hasSessionCookie = false;
    const response = proxy(new NextRequest(`http://localhost${path}`));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
