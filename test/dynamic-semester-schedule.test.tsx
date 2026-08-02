import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SchedulePage from "@/app/schedule/page";
import {
  THREE_WEEK_PLAN_V1,
  SEVEN_WEEK_PLAN_V1,
  FOURTEEN_WEEK_PLAN_V1,
} from "@/test/fixtures/programme-plans-v1";
import type { ProgrammePlanV1 } from "@/test/fixtures/programme-plan-v1";

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
/*  Schedule payload builders — mirror the real server mapping: the    */
/*  approved plan's weeks_per_semester drives exactly that many        */
/*  weekly lectures (approvedWeekCount + ensureSchedule seed them; the */
/*  route maps each row; script fallback titles are `Week N`).         */
/* ------------------------------------------------------------------ */

const LECTURE_STARTS = [
  "2026-08-04T10:00:00.000Z",
  "2026-08-11T10:00:00.000Z",
  "2026-08-18T10:00:00.000Z",
  "2026-08-25T10:00:00.000Z",
  "2026-09-01T10:00:00.000Z",
  "2026-09-08T10:00:00.000Z",
  "2026-09-15T10:00:00.000Z",
  "2026-09-22T10:00:00.000Z",
  "2026-09-29T10:00:00.000Z",
  "2026-10-06T10:00:00.000Z",
  "2026-10-13T10:00:00.000Z",
  "2026-10-20T10:00:00.000Z",
  "2026-10-27T10:00:00.000Z",
  "2026-11-03T10:00:00.000Z",
];

function schedulePayload(plan: ProgrammePlanV1) {
  const weeks = plan.workload.weeks_per_semester;
  const lectures = Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    const startsAt = LECTURE_STARTS[index];
    return {
      id: week,
      week,
      title: `Week ${week}`,
      startsAt,
      joinCutoffAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
      endsAt: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
      state: "upcoming",
      joinable: true,
      completed: false,
      blockedMessage: null,
      slides: 0,
      attendance: null,
    };
  });
  return { lectures, planVersion: 1, generation: null };
}

async function renderScheduleFor(plan: ProgrammePlanV1) {
  const payload = schedulePayload(plan);
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
  render(<SchedulePage />);
  return plan.workload.weeks_per_semester;
}

function lectureRows(): Element[] {
  return screen.queryAllByText(/^Week \d+ — /);
}

/* ------------------------------------------------------------------ */
/*  Exact lecture counts per fixture (no more, no fewer)               */
/* ------------------------------------------------------------------ */

describe("dynamic semester schedule — exact lecture counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders exactly 3 lecture entries for the 3-week plan", async () => {
    const weeks = await renderScheduleFor(THREE_WEEK_PLAN_V1);
    await waitFor(() => expect(lectureRows()).toHaveLength(weeks));
    expect(lectureRows().map((row) => row.textContent)).toEqual([
      "Week 1 — Week 1",
      "Week 2 — Week 2",
      "Week 3 — Week 3",
    ]);
  });

  it("renders exactly 7 lecture entries for the 7-week plan", async () => {
    const weeks = await renderScheduleFor(SEVEN_WEEK_PLAN_V1);
    await waitFor(() => expect(lectureRows()).toHaveLength(weeks));
    expect(lectureRows().map((row) => row.textContent)).toEqual(
      Array.from({ length: 7 }, (_, i) => `Week ${i + 1} — Week ${i + 1}`)
    );
  });

  it("renders exactly 14 lecture entries for the 14-week plan", async () => {
    const weeks = await renderScheduleFor(FOURTEEN_WEEK_PLAN_V1);
    await waitFor(() => expect(lectureRows()).toHaveLength(weeks));
    expect(lectureRows().map((row) => row.textContent)).toEqual(
      Array.from({ length: 14 }, (_, i) => `Week ${i + 1} — Week ${i + 1}`)
    );
  });

  it("never renders a week beyond the plan (no more)", async () => {
    const weeks = await renderScheduleFor(THREE_WEEK_PLAN_V1);
    await waitFor(() => expect(lectureRows()).toHaveLength(weeks));
    expect(screen.queryByText(/^Week 4 — /)).toBeNull();
    expect(screen.queryByText(/^Week 5 — /)).toBeNull();
  });
});
