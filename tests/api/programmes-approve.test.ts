import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockApproveProgramme, mockGate } = vi.hoisted(() => ({
  mockApproveProgramme: vi.fn(),
  mockGate: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireUserApi: mockGate }));
vi.mock("@/lib/programmes", () => ({ approveProgramme: mockApproveProgramme }));

import { POST } from "@/app/api/programmes/[programmeId]/approve/route";

const STUDENT_ID = "S-2026-000001";
const APPROVED = {
  id: 1,
  student_id: STUDENT_ID,
  collection_id: 1,
  name: "Test Programme",
  status: "approved",
  plan_version: 2,
  approved_at: "2026-07-28T00:00:00Z",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-28T00:00:00Z",
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/programmes/1/approve", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ programmeId: "1" }) },
  );
}

describe("POST /api/programmes/[programmeId]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGate.mockResolvedValue({ studentId: STUDENT_ID });
    mockApproveProgramme.mockResolvedValue({ ok: true, programme: APPROVED });
  });

  it("authorizes only from the server session and ignores client-sent identity fields", async () => {
    const response = await post({
      planVersion: 2,
      userId: "attacker-id",
      name: "attacker-name",
      status: "approved",
    });
    expect(response.status).toBe(200);
    // The route passed ONLY the session-derived studentId and the validated
    // planVersion; the client-sent identity/status fields never reach the
    // persistence layer.
    expect(mockApproveProgramme).toHaveBeenCalledWith(1, STUDENT_ID, 2);
  });

  it("names the exact version being approved in the response", async () => {
    const response = await post({ planVersion: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      programme: APPROVED,
      approvedVersion: 2,
    });
  });

  it("returns the same success result when the same exact version is approved twice", async () => {
    const first = await post({ planVersion: 2 });
    const second = await post({ planVersion: 2 });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
  });

  it("returns 409 with the newest version's data when the submitted version is stale", async () => {
    const current = { ...APPROVED, plan_version: 3 };
    mockApproveProgramme.mockResolvedValue({
      ok: false,
      error: "Stale plan version. Refresh and try again.",
      current,
    });
    const response = await post({ planVersion: 2 });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Stale plan version. Refresh and try again.");
    expect(body.current.plan_version).toBe(3);
  });

  it("returns 409 when the programme is approved at a different version", async () => {
    mockApproveProgramme.mockResolvedValue({
      ok: false,
      error: "Programme is already approved at a different version.",
      current: { ...APPROVED, plan_version: 3 },
    });
    const response = await post({ planVersion: 2 });
    expect(response.status).toBe(409);
    expect((await response.json()).current.plan_version).toBe(3);
  });

  it("returns 404 when the programme does not exist", async () => {
    mockApproveProgramme.mockResolvedValue({
      ok: false,
      error: "Programme not found.",
      current: null,
    });
    const response = await post({ planVersion: 2 });
    expect(response.status).toBe(404);
  });

  it("rejects malformed plan versions before touching persistence", async () => {
    const response = await post({ planVersion: "2" });
    expect(response.status).toBe(400);
    expect(mockApproveProgramme).not.toHaveBeenCalled();
  });

  it("passes through authentication failures without touching persistence", async () => {
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));
    const response = await post({ planVersion: 2 });
    expect(response.status).toBe(401);
    expect(mockApproveProgramme).not.toHaveBeenCalled();
  });
});
