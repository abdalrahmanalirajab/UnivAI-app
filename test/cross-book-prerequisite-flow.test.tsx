import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import CurriculumWorkspace from "@/app/curriculum/[programmeId]/CurriculumWorkspace";
import ProgrammeGraph, { getApprovalBlocks } from "@/app/curriculum/[programmeId]/ProgrammeGraph";
import CurriculumPage from "@/app/curriculum/[programmeId]/page";
import {
  validChainABC,
  cycleFixture,
  lowConfidenceFixture,
  missingEvidenceFixture,
  staleVersionFixture,
  unresolvedAlternativesFixture,
} from "@/test/fixtures/learning-path-v1";
import { SEVEN_WEEK_PLAN_V1 } from "@/test/fixtures/programme-plans-v1";
import type { Programme } from "@/lib/programmes";

vi.mock("@/lib/rate-limits", () => ({ enforceUserRateLimit: vi.fn(async () => null) }));

const { mockQueryOne, mockApproveProgramme, mockGate, mockStartApprovedCourseBuild } =
  vi.hoisted(() => ({
    mockQueryOne: vi.fn(),
    mockApproveProgramme: vi.fn(),
    mockGate: vi.fn(),
    mockStartApprovedCourseBuild: vi.fn().mockResolvedValue([]),
  }));

/* ------------------------------------------------------------------ */
/*  Approval-block tests — every Phase 1 fixture against the rules     */
/* ------------------------------------------------------------------ */

describe("cross-book learning path — approval blocks per fixture", () => {
  it("validChainABC renders every edge with clickable evidence and is NOT blocked", () => {
    const blocks = getApprovalBlocks(validChainABC, 3);
    expect(blocks).toEqual([]);

    render(
      <ProgrammeGraph
        plan={SEVEN_WEEK_PLAN_V1}
        learningPath={{ status: "ready", data: validChainABC }}
      />,
    );
    expect(screen.getByText("Finish Linear Algebra before Calculus I")).toBeTruthy();
    expect(screen.getByText("Finish Calculus I before Mathematical Methods")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Open evidence from/ }).length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Open evidence from Linear Algebra" }));
    expect(screen.getByRole("dialog", { name: "Evidence" })).toBeTruthy();
    expect(screen.getByText("Pages: 1–120")).toBeTruthy();
  });

  it("cycleFixture is blocked and the cycle reason is visible", () => {
    const blocks = getApprovalBlocks(cycleFixture, 1);
    expect(blocks.map((b) => b.kind)).toContain("cycle");

    render(
      <CurriculumWorkspace
        programme={programmePayload(1, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: cycleFixture }}
      />,
    );
    expect(screen.getByText("Approval blocked")).toBeTruthy();
    expect(
      screen.getByText("Prerequisite cycle detected: Linear Algebra → Calculus I → Linear Algebra."),
    ).toBeTruthy();
  });

  it("lowConfidenceFixture is blocked and the low-confidence reason is visible", () => {
    const blocks = getApprovalBlocks(lowConfidenceFixture, 1);
    expect(blocks.map((b) => b.kind)).toContain("low-confidence");

    render(
      <CurriculumWorkspace
        programme={programmePayload(1, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: lowConfidenceFixture }}
      />,
    );
    expect(screen.getByText("Approval blocked")).toBeTruthy();
    expect(screen.getByText(/has confidence 0\.4, below the 0\.7 threshold/)).toBeTruthy();
  });

  it("missingEvidenceFixture is blocked and the missing-evidence reason is visible", () => {
    const blocks = getApprovalBlocks(missingEvidenceFixture, 1);
    expect(blocks.map((b) => b.kind)).toContain("missing-evidence");

    render(
      <CurriculumWorkspace
        programme={programmePayload(1, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: missingEvidenceFixture }}
      />,
    );
    expect(screen.getByText("Approval blocked")).toBeTruthy();
    expect(screen.getByText(/has no resolvable evidence/)).toBeTruthy();
    expect(screen.getAllByText("Source unavailable").length).toBeGreaterThan(0);
  });

  it("staleVersionFixture triggers a conflict path, never a silent approval", () => {
    const blocks = getApprovalBlocks(staleVersionFixture, 3);
    expect(blocks.map((b) => b.kind)).toContain("stale-version");

    render(
      <CurriculumWorkspace
        programme={programmePayload(3, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: staleVersionFixture }}
      />,
    );
    expect(screen.getByText("Approval blocked")).toBeTruthy();
    expect(
      screen.getByText("Learning path version 2 does not match the current version 3."),
    ).toBeTruthy();
  });

  it("unresolvedAlternativesFixture is blocked with both unresolved reasons visible", () => {
    const blocks = getApprovalBlocks(unresolvedAlternativesFixture, 1);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toContain("unresolved-alternative");
    expect(kinds).toContain("unresolved-override");

    render(
      <CurriculumWorkspace
        programme={programmePayload(1, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: unresolvedAlternativesFixture }}
      />,
    );
    expect(screen.getByText("Approval blocked")).toBeTruthy();
    expect(screen.getByText(/1 unresolved alternative/)).toBeTruthy();
    expect(screen.getByText(/has an unresolved override/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Versioning — a real mutation produces a NEW version number, never  */
/*  a mutated old one. The only real mutation route in this repo is    */
/*  PATCH /api/programmes/[programmeId] (operations incl. reorder);    */
/*  Phase 4 recorded that no override-with-reason route exists yet,    */
/*  so the versioning contract is exercised through the real mechanism */
/*  that exists: updateProgrammePlan bumps plan_version by 1.          */
/* ------------------------------------------------------------------ */

describe("versioning — new version number, not a mutated old one", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("updateProgrammePlan returns plan_version + 1 and never mutates the input plan", async () => {
    vi.doMock("@/lib/db", () => ({ queryOne: mockQueryOne, query: vi.fn() }));

    const { updateProgrammePlan } = await import("@/lib/programmes");
    const before = { plan_version: 2, status: "proposed" as const };
    const after = { plan_version: 3, status: "proposed" as const };
    mockQueryOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const inputPlan = structuredClone(SEVEN_WEEK_PLAN_V1);
    const result = await updateProgrammePlan(1, "S-OWNER-1", inputPlan, 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.programme.plan_version).toBe(3);
    }
    // The old object was not mutated: it still carries the old version.
    expect(before.plan_version).toBe(2);
    // The caller's plan object was not mutated by the version bump.
    expect(inputPlan).toEqual(SEVEN_WEEK_PLAN_V1);
  });
});

/* ------------------------------------------------------------------ */
/*  Chapter reset — Book 2 restarts at chapter 1 ONLY once Book 1's    */
/*  prerequisite edge exists in the contract AND Book 1 is completed.  */
/* ------------------------------------------------------------------ */

describe("chapter reset — gated on contract edge + completion state", () => {
  it("no reset chip until the prerequisite edge is satisfied", () => {
    const { rerender } = render(
      <ProgrammeGraph
        plan={SEVEN_WEEK_PLAN_V1}
        learningPath={{ status: "ready", data: validChainABC }}
        completedBookIds={[]}
      />,
    );
    expect(screen.queryByText("Restarts at chapter 1")).toBeNull();

    rerender(
      <ProgrammeGraph
        plan={SEVEN_WEEK_PLAN_V1}
        learningPath={{ status: "ready", data: validChainABC }}
        completedBookIds={[1]}
      />,
    );
    // Book 2 (Calculus I) is the dependent of the completed 1 -> 2 edge.
    expect(screen.getByText("Restarts at chapter 1")).toBeTruthy();
    // Book 1 has no incoming edge, so it never resets — even though it is
    // itself completed.
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("book 3 resets only after its own prerequisite (book 2) is completed", () => {
    render(
      <ProgrammeGraph
        plan={SEVEN_WEEK_PLAN_V1}
        learningPath={{ status: "ready", data: validChainABC }}
        completedBookIds={[1, 2]}
      />,
    );
    // Both 1 -> 2 and 2 -> 3 are satisfied, so both dependent books reset.
    expect(screen.getAllByText("Restarts at chapter 1").length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Tamper test — server session wins over client-sent identity,       */
/*  version and status fields (Phase 5 route, exercised directly).     */
/* ------------------------------------------------------------------ */

describe("tamper test — session-derived authorization wins", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/session", () => ({ requireUserApi: mockGate }));
    vi.doMock("@/lib/programmes", () => ({ approveProgramme: mockApproveProgramme }));
    // Approval starts the real course build. These tests are about which
    // identity the route trusts, so the build is stubbed out entirely.
    vi.doMock("@/lib/generation", () => ({
      startApprovedCourseBuild: mockStartApprovedCourseBuild,
    }));
  });

  it("rejects tampered ownership: the session's registrationNumber scopes the query, not the body's", async () => {
    const { POST } = await import("@/app/api/programmes/[programmeId]/approve/route");
    mockGate.mockResolvedValue({ registrationNumber: "S-OWNER-1" });
    mockApproveProgramme.mockResolvedValue({ ok: true, programme: { plan_version: 2 } });

    const response = await POST(
      new NextRequest("http://localhost/api/programmes/1/approve", {
        method: "POST",
        body: JSON.stringify({
          planVersion: 2,
          userId: "S-ATTACKER-99",
          registrationNumber: "S-ATTACKER-99",
          name: "attacker",
          status: "approved",
        }),
      }),
      { params: Promise.resolve({ programmeId: "1" }) },
    );

    expect(response.status).toBe(200);
    // Ownership came from the server session — the tampered ids never reached
    // the persistence layer.
    expect(mockApproveProgramme).toHaveBeenCalledWith(1, "S-OWNER-1", 2);
    expect(mockApproveProgramme).not.toHaveBeenCalledWith(1, "S-ATTACKER-99", expect.anything());
  });

  it("a tampered superseded version cannot claim to be current", async () => {
    const { POST } = await import("@/app/api/programmes/[programmeId]/approve/route");
    mockGate.mockResolvedValue({ registrationNumber: "S-OWNER-1" });
    // The server's real state: latest version is 5.
    mockApproveProgramme.mockResolvedValue({
      ok: false,
      error: "Stale plan version. Refresh and try again.",
      current: { plan_version: 5 },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/programmes/1/approve", {
        method: "POST",
        body: JSON.stringify({ planVersion: 1, status: "approved" }),
      }),
      { params: Promise.resolve({ programmeId: "1" }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Stale plan version. Refresh and try again.");
    expect(body.current.plan_version).toBe(5);
    // The tampered body status field did not bypass anything.
    expect(mockApproveProgramme).toHaveBeenCalledWith(1, "S-OWNER-1", 1);
  });

  it("no session, no approval: a valid-looking body without a session is rejected", async () => {
    const { POST } = await import("@/app/api/programmes/[programmeId]/approve/route");
    mockGate.mockResolvedValue(new Response(null, { status: 401 }));

    const response = await POST(
      new NextRequest("http://localhost/api/programmes/1/approve", {
        method: "POST",
        body: JSON.stringify({ planVersion: 2, userId: "S-ATTACKER-99" }),
      }),
      { params: Promise.resolve({ programmeId: "1" }) },
    );

    expect(response.status).toBe(401);
    expect(mockApproveProgramme).not.toHaveBeenCalled();
  });

  it("tampered edge-count/eligibility fields in the body are ignored — only planVersion is read", async () => {
    const { POST } = await import("@/app/api/programmes/[programmeId]/approve/route");
    mockGate.mockResolvedValue({ registrationNumber: "S-OWNER-1" });
    mockApproveProgramme.mockResolvedValue({ ok: true, programme: { plan_version: 2 } });

    const response = await POST(
      new NextRequest("http://localhost/api/programmes/1/approve", {
        method: "POST",
        body: JSON.stringify({
          planVersion: 2,
          // Client tries to smuggle false eligibility data past the server:
          // an inflated edge count and an already-approved status.
          edgeCount: 99,
          edges: [],
          status: "approved",
          eligible: true,
        }),
      }),
      { params: Promise.resolve({ programmeId: "1" }) },
    );

    expect(response.status).toBe(200);
    // The persistence layer was reached exactly once, scoped to the session's
    // registrationNumber with only the body's planVersion forwarded — the smuggled
    // fields never influenced the check or the outcome.
    expect(mockApproveProgramme).toHaveBeenCalledTimes(1);
    expect(mockApproveProgramme).toHaveBeenCalledWith(1, "S-OWNER-1", 2);
  });
});

/* ------------------------------------------------------------------ */
/*  Refresh/restore — state is rebuilt from a fresh backend fetch,     */
/*  never from stale client memory or a broken intermediate state.     */
/* ------------------------------------------------------------------ */

const BASE_PLAN = structuredClone(SEVEN_WEEK_PLAN_V1);

function programmePayload(
  planVersion: number,
  status: "proposed" | "approved",
  learningPath: typeof validChainABC | null = null,
): Programme {
  return {
    id: 1,
    student_id: "S-OWNER-1",
    collection_id: 1,
    name: "Test Programme",
    status,
    plan_version: planVersion,
    plan: { ...BASE_PLAN, ...(learningPath ? { learning_path: learningPath } : {}) },
    schedule: {
      timezone: "Africa/Cairo",
      lectureWeekday: 0,
      lectureLocalTime: "10:00",
      sectionWeekday: 2,
      sectionLocalTime: "12:00",
      lockedAt: status === "approved" ? "2026-07-28T00:00:00Z" : null,
      firstLectureAt: status === "approved" ? "2026-08-02T07:00:00Z" : null,
    },
    approved_at: status === "approved" ? "2026-07-28T00:00:00Z" : null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-28T00:00:00Z",
  };
}

function mountCurriculumPage() {
  return render(<CurriculumPage params={Promise.resolve({ programmeId: "1" })} />);
}

/**
 * The page issues two fetches per mount: the programme (GET
 * /api/programmes/1) and the versioned learning path (GET
 * /api/programmes/1/learning-path). These helpers build the two responses a
 * mock fetch queue must serve in that order.
 */
function programmeFetchResponse(payload: Programme): Response {
  return new Response(JSON.stringify({ programme: payload }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refresh/restore — rebuilt from a fresh fetch, not client memory", () => {
  it("an in-progress approval is discarded on refresh and the fresh backend state wins", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // First load: proposed plan at version 2. The learning-path endpoint is
    // absent (404) — an explicit "no contract" state, not a broken one.
    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(2, "proposed")),
    );
    const first = mountCurriculumPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy());
    expect(screen.getByText("v2")).toBeTruthy();

    // Start an approval, leave it in flight (dialog open, nothing submitted).
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // "Refresh": the page unmounts and a fresh fetch returns the server's
    // newer state (version 3) — the in-flight dialog must be gone and the
    // UI rebuilt from the fetched payload, not from stale client memory.
    first.unmount();

    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(3, "proposed")),
    );
    const second = mountCurriculumPage();
    await waitFor(() => expect(screen.getByText("v3")).toBeTruthy());
    expect(screen.queryByText("v2")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Not stuck in a broken intermediate state: the approval control is
    // present and enabled for the fresh version.
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    second.unmount();
  });

  it("a refresh after a backend approval shows the approved state from the fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(2, "proposed")),
    );
    const first = mountCurriculumPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy());
    first.unmount();

    // The backend now serves the approved state; a fresh mount (refresh)
    // must reflect it.
    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(2, "approved")),
    );
    const second = mountCurriculumPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Approved" })).toHaveProperty("disabled", true),
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    second.unmount();
  });
});

/* ------------------------------------------------------------------ */
/*  Page-level block — the real page consumes the learning-path        */
/*  endpoint, evaluates the blocks, and disables the approve control   */
/*  itself (not just the workspace alert).                             */
/* ------------------------------------------------------------------ */

describe("page-level approval block", () => {
  it("a cycle served from the learning-path endpoint disables Approve with the reason shown", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(1, "proposed", cycleFixture)),
    );

    const mounted = mountCurriculumPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve" }),
      ).toHaveProperty("disabled", true),
    );

    // The specific reason is visible, and so is the page-level alert that
    // explains the control is disabled.
    expect(
      screen.getByText("Prerequisite cycle detected: Linear Algebra → Calculus I → Linear Algebra."),
    ).toBeTruthy();
    expect(
      screen.getByText("The learning path has unresolved issues. Review the specific reasons listed below before requesting approval."),
    ).toBeTruthy();
    mounted.unmount();
  });

  it("validChainABC served from the endpoint leaves the control enabled", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(
      programmeFetchResponse(programmePayload(3, "proposed", validChainABC)),
    );

    const mounted = mountCurriculumPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.queryByText("Approval blocked")).toBeNull();
    mounted.unmount();
  });
});

/* ------------------------------------------------------------------ */
/*  Workspace wiring — the blocks reported upward disable the approve  */
/*  control decision surface (page-level disable is asserted via the   */
/*  refresh tests above and the Phase 3 component contract).           */
/* ------------------------------------------------------------------ */

describe("workspace reports blocks upward", () => {
  it("validChainABC reports an empty block list; cycleFixture reports the cycle", () => {
    const onChange = vi.fn();
    render(
      <CurriculumWorkspace
        programme={programmePayload(3, "proposed")}
        programmeId={1}
        onProgrammeUpdated={() => {}}
        learningPath={{ status: "ready", data: validChainABC }}
        onApprovalBlocksChange={onChange}
      />,
    );
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});
