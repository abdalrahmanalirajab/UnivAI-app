import { describe, expect, it } from "vitest";
import {
  classifyParticipation,
  lectureCoveragePercent,
} from "@/lib/attendance-policy";

describe("lecture attendance policy", () => {
  it("treats 70 percent as attended", () => {
    expect(classifyParticipation(70)).toBe("attended");
    expect(classifyParticipation(100)).toBe("attended");
  });

  it("treats 50 through less than 70 percent as partially attended", () => {
    expect(classifyParticipation(50)).toBe("partially_attended");
    expect(classifyParticipation(69.9)).toBe("partially_attended");
  });

  it("treats anything below 50 percent as absent", () => {
    expect(classifyParticipation(49.9)).toBe("absent");
    expect(classifyParticipation(0)).toBe("absent");
  });

  it("does not count replayed context beyond the furthest checkpoint", () => {
    expect(
      lectureCoveragePercent({
        nextSentenceIndex: 7,
        totalSentences: 10,
        completed: false,
      }),
    ).toBe(70);
  });

  it("preserves upcoming and legacy completed records", () => {
    expect(classifyParticipation(0, { upcoming: true })).toBe("upcoming");
    expect(
      lectureCoveragePercent({
        nextSentenceIndex: 0,
        totalSentences: 0,
        completed: true,
      }),
    ).toBe(100);
  });
});
