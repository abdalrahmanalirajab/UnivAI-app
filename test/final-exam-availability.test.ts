import { describe, expect, it } from "vitest";
import { finalExamAvailabilityAt } from "@/lib/exams";

describe("final exam availability", () => {
  const lectureEnds = [
    new Date("2026-08-01T11:00:00.000Z"),
    new Date("2026-08-08T11:00:00.000Z"),
  ];

  it("stays unavailable until the last lecture ends", () => {
    expect(finalExamAvailabilityAt(
      new Date("2026-08-08T10:59:59.999Z"),
      lectureEnds,
    )).toMatchObject({ available: false, opensAt: lectureEnds[1], phase: "scheduled" });
  });

  it("opens exactly when the last lecture ends without quiz or attendance inputs", () => {
    expect(finalExamAvailabilityAt(lectureEnds[1], lectureEnds)).toMatchObject({
      available: true,
      opensAt: lectureEnds[1],
      closesAt: new Date("2026-08-09T11:00:00.000Z"),
      retakeRequestDeadline: new Date("2026-08-23T11:00:00.000Z"),
      phase: "primary-open",
    });
  });

  it("closes the primary at 24 hours and opens the 14-day request window", () => {
    expect(
      finalExamAvailabilityAt(new Date("2026-08-09T11:00:00.000Z"), lectureEnds),
    ).toMatchObject({
      available: false,
      primaryAvailable: false,
      retakeRequestAvailable: true,
      phase: "request-open",
    });
  });

  it("expires the request window at exactly 14 days", () => {
    expect(
      finalExamAvailabilityAt(new Date("2026-08-23T11:00:00.000Z"), lectureEnds),
    ).toMatchObject({ retakeRequestAvailable: false, phase: "closed" });
  });
});
