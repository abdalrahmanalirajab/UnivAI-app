import { describe, expect, it } from "vitest";

import {
  lectureOccurrenceForWeek,
  nextLectureOccurrence,
  sectionOccurrenceForLecture,
  validateScheduleContract,
} from "@/lib/schedule-contract";

describe("immutable weekly schedule contract", () => {
  const schedule = {
    timezone: "America/New_York",
    lectureWeekday: 2 as const,
    lectureLocalTime: "10:00",
    sectionWeekday: 4 as const,
    sectionLocalTime: "15:30",
  };

  it("keeps the learner-selected civil time across daylight-saving changes", () => {
    const first = new Date("2026-03-03T15:00:00.000Z");

    expect(lectureOccurrenceForWeek(first, 1, schedule).toISOString())
      .toBe("2026-03-03T15:00:00.000Z");
    expect(lectureOccurrenceForWeek(first, 2, schedule).toISOString())
      .toBe("2026-03-10T14:00:00.000Z");
  });

  it("places each section at its independently selected weekly slot", () => {
    const lecture = new Date("2026-03-10T14:00:00.000Z");
    expect(sectionOccurrenceForLecture(lecture, schedule).toISOString())
      .toBe("2026-03-12T19:30:00.000Z");
  });

  it("requires a full day of notice when selecting the first lecture", () => {
    expect(nextLectureOccurrence(
      new Date("2026-03-09T14:30:00.000Z"),
      schedule,
    ).toISOString()).toBe("2026-03-17T14:00:00.000Z");
  });

  it("rejects overlapping same-day lecture and section selections", () => {
    expect(() => validateScheduleContract({
      timezone: "Africa/Cairo",
      lectureWeekday: 1,
      lectureLocalTime: "10:00",
      sectionWeekday: 1,
      sectionLocalTime: "11:00",
    })).toThrow("at least 2 hours 30 minutes");
  });
});
