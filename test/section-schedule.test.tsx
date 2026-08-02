import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SchedulePage from "@/app/schedule/page";
import { SEVEN_WEEK_PLAN_V1 } from "@/test/fixtures/programme-plans-v1";
import { SECTION_PACKS_V1 } from "@/test/fixtures/section-pack-v1";

/* ------------------------------------------------------------------ */
/*  Mock db for getSections (lib/lectures.ts) — hoisted first          */
/* ------------------------------------------------------------------ */

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
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
    mockQueryOne.mockResolvedValue({ offset_ms: "0" });
    mockQuery.mockImplementation(async () => {
      throw new Error("unexpected query");
    });
  });

  it("schedules sections ONLY for weeks with a real SectionPack (weeks 1 and 5)", async () => {
    const weeks = SEVEN_WEEK_PLAN_V1.workload.weeks_per_semester;
    const answers = [
      [{ plan: { workload: { weeks_per_semester: weeks } } }],
      [{ count: String(weeks) }],
      Array.from({ length: weeks }, (_, i) => ({ week: i + 1 })),
      lectureRows(weeks),
    ];
    let call = 0;
    mockQuery.mockImplementation(async () => answers[call++ % answers.length]);

    const { getSections } = await import("@/lib/lectures");
    const sections = await getSections("S-2026-000001");

    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.week)).toEqual([1, 5]);
    expect(sections.map((s) => s.title)).toEqual([
      "Introduction to AI — Tutorial",
      "Calculus I — Tutorial",
    ]);
  });

  it("types sections distinctly from lectures via session_type", async () => {
    const weeks = SEVEN_WEEK_PLAN_V1.workload.weeks_per_semester;
    const answers = [
      [{ plan: { workload: { weeks_per_semester: weeks } } }],
      [{ count: String(weeks) }],
      Array.from({ length: weeks }, (_, i) => ({ week: i + 1 })),
      lectureRows(weeks),
    ];
    let call = 0;
    mockQuery.mockImplementation(async () => answers[call++ % answers.length]);

    const { getSections, getLectures } = await import("@/lib/lectures");
    const lectures = await getLectures("S-2026-000001");
    const sections = await getSections("S-2026-000001");

    expect(lectures.every((l) => l.session_type === "lecture")).toBe(true);
    expect(sections.every((s) => s.session_type === "section")).toBe(true);
  });

  it("starts every section immediately after its own lecture ends", async () => {
    const weeks = SEVEN_WEEK_PLAN_V1.workload.weeks_per_semester;
    const answers = [
      [{ plan: { workload: { weeks_per_semester: weeks } } }],
      [{ count: String(weeks) }],
      Array.from({ length: weeks }, (_, i) => ({ week: i + 1 })),
      lectureRows(weeks),
    ];
    let call = 0;
    mockQuery.mockImplementation(async () => answers[call++ % answers.length]);

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
