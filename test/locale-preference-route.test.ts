import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  query: vi.fn(),
  getCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.getCookie })),
}));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/legal", () => ({ UI_LOCALE_COOKIE: "univai-ui-locale" }));

import { GET, POST } from "@/app/api/preferences/locale/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(null);
  mocks.getCookie.mockReturnValue(undefined);
  mocks.query.mockResolvedValue([]);
});

describe("locale preference route", () => {
  it("keeps an anonymous visitor's existing Arabic cookie", async () => {
    mocks.getCookie.mockReturnValue({ name: "univai-ui-locale", value: "ar" });
    const response = await GET();

    await expect(response.json()).resolves.toEqual({ locale: "ar" });
    expect(response.headers.get("set-cookie")).toContain("univai-ui-locale=ar");
  });

  it("uses the signed-in account preference over a stale browser cookie", async () => {
    mocks.getCookie.mockReturnValue({ name: "univai-ui-locale", value: "ar" });
    mocks.getSessionUser.mockResolvedValue({ uiLocale: "en" });
    const response = await GET();

    await expect(response.json()).resolves.toEqual({ locale: "en" });
    expect(response.headers.get("set-cookie")).toContain("univai-ui-locale=en");
  });

  it("rejects unsupported locales before reading or writing account state", async () => {
    const response = await POST(
      new Request("http://localhost/api/preferences/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "fr" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "locale must be en or ar." });
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("persists a supported locale for a signed-in account and refreshes its cookie", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "10000000-0000-4000-8000-000000000002" });
    const response = await POST(
      new Request("http://localhost/api/preferences/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "ar" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ locale: "ar", savedToAccount: true });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "user" SET "uiLocale" = $2'),
      ["10000000-0000-4000-8000-000000000002", "ar"],
    );
    expect(response.headers.get("set-cookie")).toContain("univai-ui-locale=ar");
  });
});
