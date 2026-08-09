import { describe, expect, it } from "vitest";

import { templateForGrade } from "@/lib/certificates";
import { expectedMidtermCount, gradeForPercentage, scoreCourse } from "@/lib/transcripts";

describe("course transcript scoring", () => {
  it("expects one scheduled midterm per generated semester", () => {
    expect(expectedMidtermCount(1)).toBe(1);
    expect(expectedMidtermCount(2)).toBe(2);
    expect(expectedMidtermCount(null)).toBe(1);
  });

  it("uses the requested 30/10/20/40 weighting", () => {
    expect(
      scoreCourse({
        quizPercentage: 80,
        attendancePercentage: 90,
        midtermPercentage: 70,
        finalPercentage: 85,
      }),
    ).toMatchObject({
      courseworkPoints: 47,
      totalPercentage: 81,
      letterGrade: "A-",
      gpa: 3.7,
      passed: true,
    });
  });

  it.each([
    [49.99, "F", 0], [50, "D", 1], [55, "D+", 1.3],
    [60, "C-", 1.7], [63, "C", 2], [67, "C+", 2.3],
    [70, "B-", 2.7], [73, "B", 3], [77, "B+", 3.3],
    [80, "A-", 3.7], [85, "A", 4], [90, "A+", 4], [95, "A*", 4],
  ])("maps %s to %s", (percentage, letter, gpa) => {
    expect(gradeForPercentage(percentage)).toEqual({ letter, gpa });
  });

  it("selects one visual family for each D/C/B/A/A* level", () => {
    expect(templateForGrade("D+")).toBe("d");
    expect(templateForGrade("C-")).toBe("c");
    expect(templateForGrade("B+")).toBe("b");
    expect(templateForGrade("A+")).toBe("a");
    expect(templateForGrade("A*")).toBe("a-star");
  });
});
