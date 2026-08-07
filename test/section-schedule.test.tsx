import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import SchedulePage from "@/app/schedule/page";
import { SEVEN_WEEK_PLAN_V1 } from "@/test/fixtures/programme-plans-v1";
import { SECTION_PACKS_V1 } from "@/test/fixtures/section-pack-v1";
import type { SessionUser } from "@/lib/auth-types";

/* ------------------------------------------------------------------ */
/*  Mock db for getSections (lib/lectures.ts) — hoisted first          */
/* ------------------------------------------------------------------ */

const { mockQuery, mockQueryOne, mockGetSetting, mockSetSetting, mockGeneratedWeekCount } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
  mockGetSetting: vi.fn(),
  mockSetSetting: vi.fn(),
  mockGeneratedWeekCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

vi.mock("@/lib/settings", () => ({
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
}));

vi.mock("@/lib/semester-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/semester-plan")>();
  return { ...actual, readGeneratedSemesterWeekCount: mockGeneratedWeekCount };
});

// Real route handlers gate through lib/session → next/headers + lib/auth
// (better-auth). We mock those two leaves so the handlers run for real:
// requireUserApi/requireAdminApi's 401/403 logic, session-scoped queries,
// approvedWeekCount's corruption rejection and semesterHasStarted's guard
// are all exercised as-is — nothing under test is stubbed.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time")>();
  return { ...actual, useVirtualClock: () => new Date("2026-08-03T10:00:00.000Z") };
});

/* ------------------------------------------------------------------ */
/*  Shared schedule shape — weekly cadence like ensureSchedule seeds   */
/* ------------------------------------------------------------------ */

const WEEK_STARTS = [
  "2026-08-04T10:00:00.000Z",
  "2026-08-11T10:00:00.000Z",
  "2026-08-18T10:00:00.000Z",
  "2026-08-25T10:00:00.000Z",
  "2026-09-01T10:00:00.000Z",
  "2026-09-08T10:00:00.000Z",
  "2026-09-15T10:00:00.000Z",
];

const LECTURE_WINDOW_MS = 60 * 60_000;
const APPROVED_PLAN = { ...SEVEN_WEEK_PLAN_V1, section_packs: SECTION_PACKS_V1 };
const SCHEDULE_BINDING = JSON.stringify({ programmeId: 1, planVersion: 1, weekCount: 7 });

function lectureRows(weeks: number) {
  return WEEK_STARTS.slice(0, weeks).map((startsAt, index) => {
    const week = index + 1;
    return {
      id: week,
      week,
      title: `Week ${week}`,
      starts_at: new Date(startsAt),
      joined_at: null,
      completed_at: null,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Part 1 — getSections (real code, real 6b fixture, mocked db)      */
/* ------------------------------------------------------------------ */

describe("getSections — sections only after their lecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratedWeekCount.mockResolvedValue(null);
    mockGetSetting.mockResolvedValue(SCHEDULE_BINDING);
    mockQueryOne.mockResolvedValue({ offset_ms: "0" });
    mockQuery.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes("SELECT id, plan_version, plan FROM programmes")) {
        return [{ id: 1, plan_version: 1, plan: APPROVED_PLAN }];
      }
      if (text.includes("SELECT week FROM lectures")) {
        return Array.from({ length: 7 }, (_, index) => ({ week: index + 1 }));
      }
      if (text.includes("SELECT l.id, l.week")) return lectureRows(7);
      // linkGeneratedArtifacts — attaches each week's generated files to its
      // lecture row once ensureSchedule has created it.
      if (text.includes("UPDATE lectures SET") && text.includes("artifact_key")) return [];
      throw new Error(`unexpected query: ${text}`);
    });
  });

  it("schedules one practical section every week and preserves generated packs", async () => {
    const { getSections } = await import("@/lib/lectures");
    const sections = await getSections("S-2026-000001");

    expect(sections).toHaveLength(7);
    expect(sections.map((s) => s.week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(sections.find((s) => s.week === 1)?.title).toBe("Introduction to AI — Tutorial");
    expect(sections.find((s) => s.week === 5)?.title).toBe("Calculus I — Tutorial");
    expect(sections.find((s) => s.week === 2)?.title).toBe("Practical — Week 2");
    expect(sections.every((s) => s.durationMinutes >= 30 && s.durationMinutes <= 60)).toBe(true);
  });

  it("types sections distinctly from lectures via session_type", async () => {
    const { getSections, getLectures } = await import("@/lib/lectures");
    const lectures = await getLectures("S-2026-000001");
    const sections = await getSections("S-2026-000001");

    expect(lectures.every((l) => l.session_type === "lecture")).toBe(true);
    expect(sections.every((s) => s.session_type === "section")).toBe(true);
  });

  it("starts every section immediately after its own lecture ends", async () => {
    const { getSections, getLectures } = await import("@/lib/lectures");
    const lectures = await getLectures("S-2026-000001");
    const sections = await getSections("S-2026-000001");

    for (const section of sections) {
      const lecture = lectures.find((l) => l.week === section.week);
      expect(lecture).toBeDefined();
      expect(section.startsAt.getTime()).toBe(lecture!.endsAt.getTime());
      expect(lecture!.endsAt.getTime() - lecture!.startsAt.getTime()).toBe(LECTURE_WINDOW_MS);
    }
  });

  it("rejects lecture rows bound to an older approved plan version", async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({ programmeId: 1, planVersion: 0, weekCount: 7 }),
    );
    const { getLectures } = await import("@/lib/lectures");

    await expect(getLectures("S-2026-000001")).rejects.toMatchObject({
      code: "STALE_SCHEDULE",
    });
  });

  it("uses the canonical 45-minute practical when detailed SectionPacks are absent", async () => {
    mockQuery.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes("SELECT id, plan_version, plan FROM programmes")) {
        return [{ id: 1, plan_version: 1, plan: SEVEN_WEEK_PLAN_V1 }];
      }
      if (text.includes("SELECT week FROM lectures")) {
        return Array.from({ length: 7 }, (_, index) => ({ week: index + 1 }));
      }
      if (text.includes("SELECT l.id, l.week")) return lectureRows(7);
      // linkGeneratedArtifacts — attaches each week's generated files to its
      // lecture row once ensureSchedule has created it.
      if (text.includes("UPDATE lectures SET") && text.includes("artifact_key")) return [];
      throw new Error(`unexpected query: ${text}`);
    });
    const { getSections } = await import("@/lib/lectures");

    const sections = await getSections("S-2026-000001");
    expect(sections).toHaveLength(7);
    expect(sections.every((section) => section.durationMinutes === 45)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Part 2 — schedule page renders sections under their lecture       */
/* ------------------------------------------------------------------ */

describe("schedule page — section placement and typing", () => {
  function pagePayload() {
    const weeks = SEVEN_WEEK_PLAN_V1.workload.weeks_per_semester;
    const lectures = WEEK_STARTS.slice(0, weeks).map((startsAt, index) => {
      const week = index + 1;
      return {
        id: week,
        week,
        title: `Week ${week}`,
        startsAt,
        joinCutoffAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
        endsAt: new Date(new Date(startsAt).getTime() + LECTURE_WINDOW_MS).toISOString(),
        state: "upcoming",
        joinable: true,
        completed: false,
        blockedMessage: null,
        slides: 0,
        attendance: null,
      };
    });
    const sections = SECTION_PACKS_V1.flatMap((pack) =>
      pack.sections.map((section) => ({
        session_type: "section",
        id: section.id,
        week: section.week,
        kind: section.kind,
        title: section.title,
        startsAt: new Date(
          new Date(WEEK_STARTS[section.week - 1]).getTime() + LECTURE_WINDOW_MS
        ).toISOString(),
        endsAt: new Date(
          new Date(WEEK_STARTS[section.week - 1]).getTime() + LECTURE_WINDOW_MS + 45 * 60_000
        ).toISOString(),
        durationMinutes: 45,
      }))
    );
    const records = lectures.flatMap((lecture) => {
      const lectureWeek = Number(lecture.title.split(" ")[1]);
      const after = sections.filter((s) => s.week === lectureWeek);
      return [lecture, ...after];
    });
    return { records };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders each section only after its own lecture, never elsewhere", async () => {
    const payload = pagePayload();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        lectures: payload.records,
        planVersion: 1,
        generation: null,
      }),
    })) as unknown as typeof fetch;

    const { container } = render(<SchedulePage />);
    await waitFor(() => expect(screen.getAllByText(/^Week \d+ — /)).toHaveLength(7));

    const rowTexts = Array.from(container.querySelectorAll(".MuiList-root > *")).map(
      (node) => node.textContent ?? ""
    );
    const at = (needle: string) => rowTexts.findIndex((text) => text.includes(needle));

    expect(at("Week 1 —")).toBeLessThan(at("Section — Introduction to AI — Tutorial"));
    expect(at("Section — Introduction to AI — Tutorial")).toBeLessThan(at("Week 2 —"));
    expect(at("Week 5 —")).toBeLessThan(at("Section — Calculus I — Tutorial"));
    expect(at("Section — Calculus I — Tutorial")).toBeLessThan(at("Week 6 —"));

    const sectionRows = rowTexts.filter((text) => text.includes("Section — "));
    expect(sectionRows).toHaveLength(2);
  });

  it("renders sections as non-lecture rows (no join button, section chip)", async () => {
    const payload = pagePayload();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        lectures: payload.records,
        planVersion: 1,
        generation: null,
      }),
    })) as unknown as typeof fetch;

    render(<SchedulePage />);
    await waitFor(() => expect(screen.getAllByText(/^Week \d+ — /)).toHaveLength(7));

    const lectureButtons = screen.getAllByRole("button").filter((button) =>
      (button.textContent ?? "").includes("Week ")
    );
    expect(lectureButtons).toHaveLength(7);
    expect(screen.getAllByText("section")).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Phase 6f — real backend behavior: refresh/restart determinism,     */
/*  invalid-plan rejection, session-scoped access, and the started-    */
/*  plan history guard. The auth seam is mocked at the better-auth     */
/*  leaf; every route handler, lib/session guard, and lib/lectures     */
/*  function below runs its real code.                                 */
/* ------------------------------------------------------------------ */

const WEEK_ROWS = Array.from({ length: 7 }, (_, i) => ({ week: i + 1 }));
const SESSION_LECTURE_ROWS = WEEK_ROWS.map((row, index) => ({
  id: row.week,
  week: row.week,
  title: `Week ${row.week}`,
  starts_at: new Date(WEEK_STARTS[index]),
  joined_at: null,
  completed_at: null,
}));
const SESSION_ATTENDANCE_ROWS = WEEK_ROWS.map((row, index) => ({
  id: row.week,
  week: row.week,
  title: `Week ${row.week}`,
  starts_at: new Date(WEEK_STARTS[index]),
  joined_at: null,
  status: "upcoming",
  late_minutes: 0,
}));

const STARTED_FIRST_START = new Date("2026-08-01T10:00:00.000Z");

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-a",
    name: "Student A",
    email: "a@univai.test",
    emailVerified: true,
    phone: null,
    role: "student",
    studentId: "S-2026-000001",
    image: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("api routes — real backend behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratedWeekCount.mockResolvedValue(null);
    mockGetSetting.mockResolvedValue(SCHEDULE_BINDING);
    mockQueryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("clock_state")) return { offset_ms: "0" };
      if (sql.includes("FROM books")) return { exists: true };
      if (sql.includes("FROM documents")) return { exists: false };
      if (sql.includes('"user"')) return { exists: true };
      return null;
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, plan_version, plan FROM programmes")) {
        return [{ id: 1, plan_version: 1, plan: APPROVED_PLAN }];
      }
      if (sql.includes("SELECT week FROM lectures")) return WEEK_ROWS;
      if (sql.includes("completed_at")) return SESSION_LECTURE_ROWS;
      if (sql.includes("a.status")) return SESSION_ATTENDANCE_ROWS;
      if (sql.includes("SELECT status, error FROM books")) return [];
      if (sql.includes("MIN(starts_at)")) return [{ starts_at: STARTED_FIRST_START }];
      // linkGeneratedArtifacts — attaches each week's generated files to its
      // lecture row once ensureSchedule has created it.
      if (sql.includes("UPDATE lectures SET") && sql.includes("artifact_key")) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
  });

  async function setSession(user: SessionUser | null) {
    const { auth } = await import("@/lib/auth");
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      user ? { user } : null
    );
  }

  it("a refresh or restart re-serves the same approved schedule from the backend", async () => {
    await setSession(sessionUser());
    const { GET } = await import("@/app/api/lectures/route");

    const first = await GET();
    const second = await GET();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const a = await first.json();
    const b = await second.json();
    expect(a.lectures).toHaveLength(14);
    expect(a).toEqual(b);
    expect(a.planVersion).toBe(1);
    expect(
      a.lectures
        .filter((record: { session_type: string }) => record.session_type === "lecture")
        .map((lecture: { week: number }) => lecture.week),
    ).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(
      a.lectures
        .filter((record: { session_type: string }) => record.session_type === "section")
        .map((section: { week: number }) => section.week),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("an approved plan with unusable data is rejected by the real corruption check", async () => {
    await setSession(sessionUser());
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, plan_version, plan FROM programmes")) {
        return [{ id: 1, plan_version: 1, plan: { workload: {} } }];
      }
      if (sql.includes("SELECT status, error FROM books")) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
    const { GET } = await import("@/app/api/lectures/route");

    const response = await GET();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "INVALID_APPROVED_PLAN",
      error: "The approved programme has no valid weeks_per_semester.",
    });
  });

  it("reconciles an unstarted placeholder schedule to the generated week count", async () => {
    mockGeneratedWeekCount.mockResolvedValue(5);
    mockGetSetting.mockResolvedValue(SCHEDULE_BINDING);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, plan_version, plan FROM programmes")) {
        return [{ id: 1, plan_version: 1, plan: APPROVED_PLAN }];
      }
      if (sql.includes("SELECT week FROM lectures")) return WEEK_ROWS;
      if (sql.includes("MIN(starts_at)")) {
        return [{ starts_at: new Date("2099-01-01T10:00:00.000Z") }];
      }
      if (sql.startsWith("DELETE") || sql.startsWith("UPDATE")) return [];
      throw new Error(`unexpected query: ${sql}`);
    });

    const { ensureSchedule } = await import("@/lib/lectures");
    const result = await ensureSchedule("S-2026-000001");

    expect(result?.weekCount).toBe(5);
    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM lectures WHERE student_id = $1 AND week > $2",
      ["S-2026-000001", 5],
    );
    expect(mockSetSetting).toHaveBeenCalledWith(
      "schedule:S-2026-000001:approved-plan",
      JSON.stringify({ programmeId: 1, planVersion: 1, weekCount: 5 }),
    );
  });

  it("an unauthenticated session is denied by the real API guard (401)", async () => {
    await setSession(null);
    const { GET } = await import("@/app/api/lectures/route");

    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated." });
  });

  it("a non-admin session is denied by the real admin guard (403)", async () => {
    await setSession(sessionUser());
    const { POST } = await import("@/app/api/admin/restart/route");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/restart", {
        method: "POST",
        body: JSON.stringify({ sid: "S-2026-000001" }),
      })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admins only." });
  });

  it("schedule queries are scoped to the session's studentId — another user's ID is never honored", async () => {
    await setSession(sessionUser({ studentId: "S-2026-000002" }));
    const { GET } = await import("@/app/api/lectures/route");

    const res = await GET();
    expect(res.status).toBe(200);

    const planCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SELECT id, plan_version, plan FROM programmes")
    );
    expect(planCall).toBeDefined();
    expect(planCall?.[1]).toEqual(["S-2026-000002"]);

    const booksCall = mockQueryOne.mock.calls.find(([sql]) => String(sql).includes("FROM books"));
    expect(booksCall).toBeDefined();
    expect(booksCall?.[1]).toEqual(["S-2026-000002"]);
  });

  it("an already-started plan's history cannot be rewritten (409 PLAN_ALREADY_STARTED)", async () => {
    await setSession(sessionUser({ role: "super_admin", studentId: "S-2026-000042" }));
    const { POST } = await import("@/app/api/admin/restart/route");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/restart", {
        method: "POST",
        body: JSON.stringify({ sid: "S-2026-000001" }),
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PLAN_ALREADY_STARTED");
    expect(body.error).toContain("cannot be rewritten");

    const destructive = mockQuery.mock.calls.filter(([sql]) => {
      const text = String(sql);
      return text.startsWith("DELETE") || text.startsWith("UPDATE") || text.startsWith("INSERT");
    });
    expect(destructive).toHaveLength(0);
  });

  it("a not-yet-started plan passes the real guard and the restart rewrites it", async () => {
    vi.stubEnv("UNIVAI_MODE", "standalone");
    try {
      await setSession(sessionUser({ role: "super_admin", studentId: "S-2026-000042" }));
      mockGetSetting.mockResolvedValue(SCHEDULE_BINDING);
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("MIN(starts_at)"))
          return [{ starts_at: new Date("2099-01-01T10:00:00.000Z") }];
        if (sql.includes("SELECT id, plan_version, plan FROM programmes"))
          return [{ id: 1, plan_version: 1, plan: APPROVED_PLAN }];
        if (sql.includes("SELECT week FROM lectures")) return WEEK_ROWS;
        if (String(sql).startsWith("DELETE")) return [];
        if (String(sql).startsWith("UPDATE")) return [];
        throw new Error(`unexpected query: ${sql}`);
      });
      const { POST } = await import("@/app/api/admin/restart/route");

      const res = await POST(
        new NextRequest("http://localhost/api/admin/restart", {
          method: "POST",
          body: JSON.stringify({ sid: "S-2026-000001" }),
        })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const deletes = mockQuery.mock.calls.filter(([sql]) => String(sql).startsWith("DELETE"));
      // Only the reschedule's own writes: ensureSchedule also links each
      // week's generated artifacts, which is an UPDATE that moves no lecture.
      const updates = mockQuery.mock.calls.filter(
        ([sql]) => String(sql).startsWith("UPDATE") && String(sql).includes("starts_at"),
      );
      expect(deletes).toHaveLength(3); // attendance, grades, qa_log wiped
      expect(updates).toHaveLength(7); // every lecture moved to the fresh cadence
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
