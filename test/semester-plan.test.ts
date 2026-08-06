import { describe, expect, it } from "vitest";
import {
  GeneratedSemesterPlanError,
  parseGeneratedSemesterPlan,
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

function coursePlan(chapterCount: number, semesterWeeks: number[]) {
  let globalWeek = 1;
  const semesters = semesterWeeks.map((weekCount, index) => {
    const startsAtWeek = globalWeek;
    globalWeek += weekCount;
    return {
      semester: index + 1,
      week_count: weekCount,
      starts_at_week: startsAtWeek,
      ends_at_week: globalWeek - 1,
      quiz_count: weekCount,
      midterms: Array.from({ length: Math.floor(weekCount / 4) }, (_, midtermIndex) => ({
        number: midtermIndex + 1,
        after_week: (midtermIndex + 1) * 4,
      })),
      final_after_week: weekCount,
    };
  });
  const weeks = semesters.flatMap((semester) =>
    Array.from({ length: semester.week_count }, (_, index) => ({
      week: semester.starts_at_week + index,
      semester: semester.semester,
      semester_week: index + 1,
    })),
  );
  return {
    schema_name: "univai.semester.week-plan",
    schema_version: "2.0.0",
    chapter_count: chapterCount,
    semester_count: semesters.length,
    week_count: weeks.length,
    weeks,
    semesters,
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

  it.each([
    [8, [8]],
    [12, [8]],
    [20, [12]],
    [30, [12, 12]],
  ] as const)("accepts the canonical %i-chapter course shape", (chapters, semesterWeeks) => {
    const parsed = parseGeneratedSemesterPlan(coursePlan(chapters, [...semesterWeeks]));
    expect(parsed.chapterCount).toBe(chapters);
    expect(parsed.semesters.map((semester) => semester.weekCount)).toEqual([...semesterWeeks]);
  });
});

describe("generated lecture duration contract", () => {
  const script = { lectureId: "week-1", title: "Week 1", segments: [] };

  it.each([45, 60, 120])("uses a valid %i-minute generated duration", (durationMinutes) => {
    expect(scriptDurationMinutes({ ...script, durationMinutes })).toBe(durationMinutes);
  });

  it.each([undefined, 30, 44, 121, 45.5])("falls back for invalid duration %s", (durationMinutes) => {
    expect(scriptDurationMinutes({ ...script, durationMinutes })).toBe(60);
  });
});
