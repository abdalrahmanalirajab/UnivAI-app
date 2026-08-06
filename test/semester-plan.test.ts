import { describe, expect, it } from "vitest";
import {
  GeneratedSemesterPlanError,
  parseSemesterPlanWeekCount,
} from "@/lib/semester-plan";
import { scriptDurationMinutes } from "@/lib/lecture-duration";

function plan(weekCount: number) {
  return {
    schema_name: "univai.semester.week-plan",
    schema_version: "1.0.0",
    week_count: weekCount,
    weeks: Array.from({ length: weekCount }, (_, index) => ({ week: index + 1 })),
  };
}

describe("generated semester plan contract", () => {
  it.each([1, 5, 8, 12])("accepts a contiguous %i-week plan", (weekCount) => {
    expect(parseSemesterPlanWeekCount(plan(weekCount))).toBe(weekCount);
  });

  it.each([0, 13])("rejects an out-of-range %i-week plan", (weekCount) => {
    expect(() => parseSemesterPlanWeekCount(plan(weekCount))).toThrow(GeneratedSemesterPlanError);
  });

  it("rejects a mismatched or non-contiguous weeks array", () => {
    expect(() =>
      parseSemesterPlanWeekCount({ ...plan(3), weeks: [{ week: 1 }, { week: 3 }, { week: 2 }] }),
    ).toThrow(/contiguous/);
    expect(() => parseSemesterPlanWeekCount({ ...plan(3), weeks: [{ week: 1 }] })).toThrow(
      /does not match/,
    );
  });
});

describe("generated lecture duration contract", () => {
  const script = { lectureId: "week-1", title: "Week 1", segments: [] };

  it.each([30, 60, 120])("uses a valid %i-minute generated duration", (durationMinutes) => {
    expect(scriptDurationMinutes({ ...script, durationMinutes })).toBe(durationMinutes);
  });

  it.each([undefined, 29, 121, 30.5])("falls back for invalid duration %s", (durationMinutes) => {
    expect(scriptDurationMinutes({ ...script, durationMinutes })).toBe(60);
  });
});
