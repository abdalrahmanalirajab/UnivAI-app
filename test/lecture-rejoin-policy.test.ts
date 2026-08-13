import { describe, expect, it } from "vitest";
import { lectureJoinBlockReason } from "@/lib/lectures";

const startsAt = new Date("2026-08-13T10:00:00.000Z");
const cutoffAt = new Date("2026-08-13T10:30:00.000Z");

describe("live lecture rejoin policy", () => {
  it("blocks a first-time learner after the join cutoff", () => {
    expect(
      lectureJoinBlockReason({
        completed: false,
        previouslyAdmitted: false,
        virtualNow: new Date("2026-08-13T10:31:00.000Z"),
        startsAt,
        cutoffAt,
      }),
    ).toBe("missed");
  });

  it("allows an already admitted learner after the cutoff", () => {
    expect(
      lectureJoinBlockReason({
        completed: false,
        previouslyAdmitted: true,
        virtualNow: new Date("2026-08-13T12:00:00.000Z"),
        startsAt,
        cutoffAt,
      }),
    ).toBeNull();
  });

  it("still keeps completed lectures closed", () => {
    expect(
      lectureJoinBlockReason({
        completed: true,
        previouslyAdmitted: true,
        virtualNow: new Date("2026-08-13T10:20:00.000Z"),
        startsAt,
        cutoffAt,
      }),
    ).toBe("completed");
  });
});
