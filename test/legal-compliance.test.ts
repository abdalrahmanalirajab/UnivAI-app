import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/env", () => ({
  env: { BETTER_AUTH_SECRET: "test-legal-signing-secret-at-least-32-bytes" },
}));

import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from "@/lib/legal-documents";
import {
  LEGAL_SIGNUP_COOKIE,
  createLegalSignupToken,
  legalDocumentHash,
  recordLegalAcceptances,
  validSignupAttestation,
  validUploadAttestation,
  verifyLegalSignupToken,
} from "@/lib/legal";
import { POST as preaccept } from "@/app/api/legal/preaccept/route";

const currentAcceptance = {
  eulaAccepted: true,
  eulaVersion: CURRENT_EULA_VERSION,
  privacyNoticeAcknowledged: true,
  privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
  uiLocale: "ar",
} as const;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("legal acceptance validation", () => {
  it("accepts only the current EULA and Privacy Notice with a supported locale", () => {
    expect(validSignupAttestation(currentAcceptance)).toBe(true);
    expect(validSignupAttestation({ ...currentAcceptance, eulaAccepted: "true" })).toBe(false);
    expect(validSignupAttestation({ ...currentAcceptance, eulaVersion: "2025-01-01" })).toBe(false);
    expect(
      validSignupAttestation({ ...currentAcceptance, privacyNoticeAcknowledged: false }),
    ).toBe(false);
    expect(validSignupAttestation({ ...currentAcceptance, uiLocale: "fr" })).toBe(false);
  });

  it("requires the current EULA fields on upload form data", () => {
    const accepted = new FormData();
    accepted.set("eulaAccepted", "true");
    accepted.set("eulaVersion", CURRENT_EULA_VERSION);
    expect(validUploadAttestation(accepted)).toBe(true);

    accepted.set("eulaVersion", "stale-version");
    expect(validUploadAttestation(accepted)).toBe(false);
    accepted.set("eulaVersion", CURRENT_EULA_VERSION);
    accepted.set("eulaAccepted", "1");
    expect(validUploadAttestation(accepted)).toBe(false);
  });

  it("verifies an untampered short-lived signup token and rejects tampering or expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    const token = createLegalSignupToken("ar");
    const headers = new Headers({ cookie: `${LEGAL_SIGNUP_COOKIE}=${token}` });

    expect(verifyLegalSignupToken(headers)).toMatchObject(currentAcceptance);
    expect(
      verifyLegalSignupToken(
        new Headers({ cookie: `${LEGAL_SIGNUP_COOKIE}=${token.slice(0, -1)}x` }),
      ),
    ).toBeNull();
    expect(
      verifyLegalSignupToken(new Headers({ cookie: `${LEGAL_SIGNUP_COOKIE}=${token}.extra` })),
    ).toBeNull();

    vi.advanceTimersByTime(15 * 60_000 + 1);
    expect(verifyLegalSignupToken(headers)).toBeNull();
  });

  it("treats a malformed percent-encoded cookie as invalid instead of throwing", () => {
    expect(
      verifyLegalSignupToken(new Headers({ cookie: `${LEGAL_SIGNUP_COOKIE}=%` })),
    ).toBeNull();
  });

  it("hashes and records the exact language presented to the learner", async () => {
    expect(legalDocumentHash("eula", "ar")).not.toBe(legalDocumentHash("eula", "en"));

    await recordLegalAcceptances({
      userId: "10000000-0000-4000-8000-000000000001",
      registrationNumber: "S-2026-000001",
      locale: "ar",
      context: "email_signup",
      documents: ["eula"],
      headers: new Headers({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "Compliance test browser",
      }),
      acceptedAt: new Date("2026-08-12T12:00:00.000Z"),
    });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const parameters = mocks.query.mock.calls[0][1];
    expect(parameters).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "S-2026-000001",
      "eula",
      CURRENT_EULA_VERSION,
      legalDocumentHash("eula", "ar"),
      "email_signup",
      "ar",
      new Date("2026-08-12T12:00:00.000Z"),
      "203.0.113.7",
      "Compliance test browser",
    ]);
  });
});

describe("legal preacceptance endpoint", () => {
  it("rejects a stale or incomplete acceptance without issuing cookies", async () => {
    const response = await preaccept(
      new Request("http://localhost/api/legal/preaccept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentAcceptance, privacyNoticeVersion: "stale" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "LEGAL_ACCEPTANCE_REQUIRED",
      versions: {
        eula: CURRENT_EULA_VERSION,
        privacyNotice: CURRENT_PRIVACY_NOTICE_VERSION,
      },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("issues protected, short-lived evidence and locale cookies for current acceptance", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await preaccept(
      new Request("http://localhost/api/legal/preaccept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentAcceptance),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true, locale: "ar" });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${LEGAL_SIGNUP_COOKIE}=`);
    expect(setCookie).toContain("univai-ui-locale=ar");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });
});
