import { describe, expect, it } from "vitest";
import { finalExamAvailabilityAt } from "@/lib/exams";

describe("final exam availability", () => {
  const lectureEnds = [
    new Date("2026-08-01T11:00:00.000Z"),
    new Date("2026-08-08T11:00:00.000Z"),
  ];

  it("stays unavailable until the last lecture ends", () => {
    expect(
      finalExamAvailabilityAt(new Date("2026-08-08T10:59:59.999Z"), lectureEnds),
    ).toEqual({ available: false, opensAt: lectureEnds[1] });
  });

  it("opens exactly when the last lecture ends without quiz or attendance inputs", () => {
    expect(finalExamAvailabilityAt(lectureEnds[1], lectureEnds)).toEqual({
      available: true,
      opensAt: lectureEnds[1],
    });
  });
});
