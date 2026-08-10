import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  poolQuery: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  pool: { query: mocks.poolQuery, connect: mocks.connect },
}));

import {
  enforceUserRateLimit,
  parseAdminRateLimitPolicy,
  RATE_LIMIT_DEFAULTS,
} from "@/lib/rate-limits";

describe("user rate limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consumes a request atomically and allows requests inside the limit", async () => {
    mocks.queryOne.mockResolvedValue({
      enabled: true,
      blocked: false,
      max_requests: 8,
      window_seconds: 3600,
      request_count: 3,
      retry_after_seconds: 120,
    });
    await expect(
      enforceUserRateLimit("55cbe793-8a4b-4518-88ea-25b43f19e24a", "upload"),
    ).resolves.toBeNull();
    expect(mocks.queryOne.mock.calls[0][0]).toContain("ON CONFLICT (user_id, scope, bucket_start)");
    expect(mocks.queryOne.mock.calls[0][1]).toEqual([
      "55cbe793-8a4b-4518-88ea-25b43f19e24a",
      "upload",
      RATE_LIMIT_DEFAULTS.upload.maxRequests,
      RATE_LIMIT_DEFAULTS.upload.windowSeconds,
    ]);
  });

  it("returns 429 and Retry-After when a policy is exhausted", async () => {
    mocks.queryOne.mockResolvedValue({
      enabled: true,
      blocked: false,
      max_requests: 4,
      window_seconds: 3600,
      request_count: 5,
      retry_after_seconds: 73,
    });
    const response = await enforceUserRateLimit(
      "55cbe793-8a4b-4518-88ea-25b43f19e24a",
      "generation",
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("73");
    await expect(response?.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("lets an admin disable a limit and fails closed if enforcement breaks", async () => {
    mocks.queryOne.mockResolvedValueOnce({
      enabled: false,
      blocked: false,
      max_requests: 1,
      window_seconds: 60,
      request_count: 0,
      retry_after_seconds: 60,
    });
    await expect(
      enforceUserRateLimit("55cbe793-8a4b-4518-88ea-25b43f19e24a", "live"),
    ).resolves.toBeNull();

    mocks.queryOne.mockRejectedValueOnce(new Error("database detail must not leak"));
    const response = await enforceUserRateLimit(
      "55cbe793-8a4b-4518-88ea-25b43f19e24a",
      "live",
    );
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain("database detail");
  });

  it("strictly validates manual admin policies", () => {
    expect(
      parseAdminRateLimitPolicy({
        registrationNumber: "S-2026-000017",
        scope: "assessment",
        enabled: true,
        blocked: false,
        maxRequests: 12,
        windowSeconds: 60,
      }),
    ).toMatchObject({ scope: "assessment", maxRequests: 12 });
    expect(() =>
      parseAdminRateLimitPolicy({
        registrationNumber: "S-2026-000017",
        scope: "everything",
        enabled: true,
        blocked: false,
        maxRequests: 12,
        windowSeconds: 60,
      }),
    ).toThrow("valid rate-limit area");
  });
});
