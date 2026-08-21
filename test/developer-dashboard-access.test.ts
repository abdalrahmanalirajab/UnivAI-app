// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  searchDeveloperUsers: vi.fn(),
  getDeveloperUserSnapshot: vi.fn(),
  getDeveloperUserTableRecords: vi.fn(),
  mutateDeveloperUserTableRecord: vi.fn(),
  mutateDeveloperUser: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireDeveloperApi: mocks.requireDeveloperApi }));
vi.mock("@/lib/developer-users", () => {
  class DeveloperInputError extends Error {}
  class DeveloperNotFoundError extends Error {}
  return {
    DeveloperInputError,
    DeveloperNotFoundError,
    searchDeveloperUsers: mocks.searchDeveloperUsers,
    getDeveloperUserSnapshot: mocks.getDeveloperUserSnapshot,
    getDeveloperUserTableRecords: mocks.getDeveloperUserTableRecords,
    mutateDeveloperUserTableRecord: mocks.mutateDeveloperUserTableRecord,
    mutateDeveloperUser: mocks.mutateDeveloperUser,
  };
});

import { isDeveloperEmail, parseDeveloperEmails } from "@/lib/developer-access";
import { GET as searchUsers } from "@/app/api/dev/users/route";
import { GET as inspectUser, PATCH as mutateUser } from "@/app/api/dev/users/[userId]/route";
import { GET as inspectTable, PATCH as mutateTable } from "@/app/api/dev/users/[userId]/records/route";

const DEVELOPER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "mtolba2004@gmail.com",
  role: "student",
};
const USER_ID = "10000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ userId: USER_ID }) };
const snapshot = {
  user: { id: USER_ID, email: "student@example.test" },
  accounts: [],
  sessions: [],
  footprint: [],
};

describe("developer allowlist", () => {
  it("normalizes CSV values, removes duplicates, and uses the corrected initial accounts", () => {
    expect(parseDeveloperEmails(" MTolba2004@gmail.com,dev@gmail.com,DEV@gmail.com,invalid ")).toEqual([
      "mtolba2004@gmail.com",
      "dev@gmail.com",
    ]);
    const configured = "mtolba2004@gmail.com,dev@gmail.com";
    expect(isDeveloperEmail("DEV@GMAIL.COM", configured)).toBe(true);
    expect(isDeveloperEmail("admin@gmail.com", configured)).toBe(false);
  });
});

describe("developer user API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeveloperApi.mockResolvedValue(DEVELOPER);
    mocks.searchDeveloperUsers.mockResolvedValue([]);
    mocks.getDeveloperUserSnapshot.mockResolvedValue(snapshot);
    mocks.getDeveloperUserTableRecords.mockResolvedValue({ table: "lectures", primaryKey: ["id"], editableColumns: ["title"], rows: [], truncated: false });
    mocks.mutateDeveloperUserTableRecord.mockResolvedValue(undefined);
    mocks.mutateDeveloperUser.mockResolvedValue(undefined);
  });

  it("fails closed before reading the database for a non-developer", async () => {
    mocks.requireDeveloperApi.mockResolvedValue(
      Response.json({ error: "Developer access required." }, { status: 403 })
    );
    const response = await searchUsers(new Request("http://localhost/api/dev/users"));
    expect(response.status).toBe(403);
    expect(mocks.searchDeveloperUsers).not.toHaveBeenCalled();
  });

  it("bounds search through the service and disables response caching", async () => {
    const response = await searchUsers(
      new Request("http://localhost/api/dev/users?search=S-2026-000042")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.searchDeveloperUsers).toHaveBeenCalledWith("S-2026-000042");
  });

  it("requires an explicit header before returning a password hash", async () => {
    const denied = await inspectUser(
      new Request(`http://localhost/api/dev/users/${USER_ID}?revealPasswordHash=1`),
      context
    );
    expect(denied.status).toBe(400);
    expect(mocks.getDeveloperUserSnapshot).not.toHaveBeenCalled();

    const allowed = await inspectUser(
      new Request(`http://localhost/api/dev/users/${USER_ID}?revealPasswordHash=1`, {
        headers: { "X-Dev-Confirm": "REVEAL PASSWORD HASH" },
      }),
      context
    );
    expect(allowed.status).toBe(200);
    expect(mocks.getDeveloperUserSnapshot).toHaveBeenCalledWith(USER_ID, true);
  });

  it("rejects cross-site and oversized mutations before touching the database", async () => {
    const crossSite = await mutateUser(
      new Request(`http://localhost/api/dev/users/${USER_ID}`, {
        method: "PATCH",
        headers: { Origin: "https://attacker.example" },
        body: JSON.stringify({ action: "revoke_sessions" }),
      }),
      context
    );
    expect(crossSite.status).toBe(403);

    const oversized = await mutateUser(
      new Request(`http://localhost/api/dev/users/${USER_ID}`, {
        method: "PATCH",
        headers: { Origin: "http://localhost", "Content-Length": "20000" },
        body: JSON.stringify({ action: "revoke_sessions" }),
      }),
      context
    );
    expect(oversized.status).toBe(413);
    expect(mocks.mutateDeveloperUser).not.toHaveBeenCalled();
  });

  it("passes the authenticated developer into audited mutations", async () => {
    const response = await mutateUser(
      new Request(`http://localhost/api/dev/users/${USER_ID}`, {
        method: "PATCH",
        headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_sessions" }),
      }),
      context
    );
    expect(response.status).toBe(200);
    expect(mocks.mutateDeveloperUser).toHaveBeenCalledWith(DEVELOPER, USER_ID, {
      action: "revoke_sessions",
    });
    expect(mocks.getDeveloperUserSnapshot).toHaveBeenCalledWith(USER_ID);
  });

  it("loads a selected user-owned table through the guarded drilldown", async () => {
    const response = await inspectTable(
      new Request(`http://localhost/api/dev/users/${USER_ID}/records?table=lectures`),
      context
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getDeveloperUserTableRecords).toHaveBeenCalledWith(USER_ID, "lectures");
  });

  it("same-origin guards and attributes a confirmed raw record update", async () => {
    const body = JSON.stringify({
      table: "lectures",
      key: { id: 42 },
      changes: { title: "Corrected title" },
      confirmation: "SAVE RECORD",
    });
    const blocked = await mutateTable(
      new Request(`http://localhost/api/dev/users/${USER_ID}/records`, {
        method: "PATCH",
        headers: { Origin: "https://attacker.example" },
        body,
      }),
      context
    );
    expect(blocked.status).toBe(403);
    expect(mocks.mutateDeveloperUserTableRecord).not.toHaveBeenCalled();

    const allowed = await mutateTable(
      new Request(`http://localhost/api/dev/users/${USER_ID}/records`, {
        method: "PATCH",
        headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        body,
      }),
      context
    );
    expect(allowed.status).toBe(200);
    expect(mocks.mutateDeveloperUserTableRecord).toHaveBeenCalledWith(
      DEVELOPER,
      USER_ID,
      "lectures",
      { key: { id: 42 }, changes: { title: "Corrected title" }, confirmation: "SAVE RECORD" }
    );
  });
});
