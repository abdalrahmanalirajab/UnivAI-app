import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: mocks.query, queryOne: mocks.queryOne }));

import {
  buildPersonalDataExport,
  createPrivacyRequest,
  validatePrivacyRequest,
} from "@/lib/privacy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.queryOne.mockResolvedValue(null);
});

describe("privacy request validation", () => {
  it("accepts supported requests and enforces the detailed-request rules", () => {
    expect(validatePrivacyRequest("access", null)).toBeNull();
    expect(validatePrivacyRequest("deletion", "")).toBeNull();
    expect(validatePrivacyRequest("unknown", null)).toBe(
      "Choose a supported privacy request type.",
    );
    expect(validatePrivacyRequest("correction", "too short")).toContain("at least 10");
    expect(validatePrivacyRequest("objection", "A sufficiently clear reason")).toBeNull();
    expect(validatePrivacyRequest("access", "x".repeat(2001))).toContain("2,000");
    expect(validatePrivacyRequest("access", `invalid\u0000text`)).toContain(
      "unsupported control character",
    );
  });

  it("repairs an opt-out preference when a duplicate request is retried", async () => {
    const existing = {
      id: "20000000-0000-4000-8000-000000000001",
      request_type: "sale_share_opt_out",
      status: "received",
      detail: null,
      submitted_at: "2026-08-12T10:00:00.000Z",
      due_at: "2026-09-11T10:00:00.000Z",
      completed_at: null,
      admin_note: null,
    };
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM privacy_requests")) return existing;
      if (sql.includes("FROM privacy_preferences")) return null;
      if (sql.includes("INSERT INTO privacy_preferences")) {
        return {
          sale_or_sharing_opt_out: true,
          limit_sensitive_data_use: false,
          updated_at: "2026-08-12T10:01:00.000Z",
        };
      }
      return null;
    });

    const result = await createPrivacyRequest({
      userId: "10000000-0000-4000-8000-000000000003",
      registrationNumber: "S-2026-000003",
      requestType: "sale_share_opt_out",
    });

    expect(result.duplicate).toBe(true);
    expect(result.request.requestType).toBe("sale_share_opt_out");
    expect(
      mocks.queryOne.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO privacy_preferences"),
      ),
    ).toBe(true);
  });
});

describe("personal data export", () => {
  it("keeps every query tenant-scoped and returns a documented, secret-free shape", async () => {
    const userId = "10000000-0000-4000-8000-000000000004";
    const registrationNumber = "S-2026-000004";
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "user"')) {
        return [{
          id: userId,
          name: "Export Learner",
          email: "export@example.test",
          uiLocale: "ar",
        }];
      }
      if (sql.includes("FROM books")) return [{ id: 7, title: "Owned source" }];
      return [];
    });

    const payload = await buildPersonalDataExport({ userId, registrationNumber });

    expect(payload).toMatchObject({
      exportVersion: "univai-personal-data-v1",
      account: { id: userId, uiLocale: "ar" },
      learning: { books: [{ id: 7, title: "Owned source" }] },
    });
    expect(payload.scopeNote).toContain("separately deployed exam");
    expect(payload.scopeNote).toContain("uploaded file bytes");

    for (const [sql, params] of mocks.query.mock.calls) {
      expect(String(sql)).not.toMatch(/SELECT\s+\*/i);
      const usesUserId =
        String(sql).includes('FROM "user"') ||
        String(sql).includes("FROM account") ||
        String(sql).includes("FROM session") ||
        String(sql).includes("FROM legal_acceptances") ||
        String(sql).includes("FROM privacy_requests") ||
        String(sql).includes("FROM privacy_preferences") ||
        String(sql).includes("FROM user_subscriptions") ||
        String(sql).includes("FROM coin_wallets") ||
        String(sql).includes("FROM coin_transactions") ||
        String(sql).includes("FROM notification_preferences") ||
        String(sql).includes("FROM notification_email_outbox") ||
        String(sql).includes("FROM notification_email_delivery_log") ||
        String(sql).includes("FROM user_rate_limit_policies") ||
        String(sql).includes("FROM user_rate_limit_usage");
      if (String(sql).includes("FROM auth_audit")) {
        expect(params).toEqual([userId, registrationNumber]);
      } else {
        expect(params).toEqual([usesUserId ? userId : registrationNumber]);
      }
    }

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('"password"');
    expect(serialized).not.toContain('"accessToken"');
    expect(serialized).not.toContain('"refreshToken"');
    expect(serialized).not.toContain('"token"');
  });

  it("omits independently unavailable optional tables but surfaces other database failures", async () => {
    mocks.query.mockRejectedValue({ code: "42P01" });
    await expect(
      buildPersonalDataExport({
        userId: "10000000-0000-4000-8000-000000000005",
        registrationNumber: "S-2026-000005",
      }),
    ).resolves.toMatchObject({ account: null, linkedAccounts: [], sessions: [] });

    mocks.query.mockRejectedValue(new Error("database unavailable"));
    await expect(
      buildPersonalDataExport({
        userId: "10000000-0000-4000-8000-000000000005",
        registrationNumber: "S-2026-000005",
      }),
    ).rejects.toThrow("database unavailable");
  });
});
