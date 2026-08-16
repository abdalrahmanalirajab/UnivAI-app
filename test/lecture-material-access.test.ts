import { describe, expect, it } from "vitest";
import { lectureMaterialAccessAt } from "@/lib/lecture-materials";

const START = new Date("2026-08-10T10:00:00.000Z");

function row(joinedAt: Date | null = null) {
  return {
    lecture_id: "11111111-1111-4111-8111-111111111111",
    artifact_id: "22222222-2222-4222-8222-222222222222",
    week: 2,
    title: "Storage engines",
    starts_at: START,
    joined_at: joinedAt,
    completed_at: null,
    script_payload: { durationMinutes: 60 },
  };
}

describe("lecture presentation access", () => {
  it("keeps presentation material locked before the lecture starts", () => {
    const access = lectureMaterialAccessAt(row(), new Date("2026-08-10T09:59:59.000Z"));
    expect(access).toMatchObject({
      available: false,
      mode: null,
      blockedReason: "not_started",
    });
  });

  it("serves live slides only after the trusted join has been recorded", () => {
    const withoutJoin = lectureMaterialAccessAt(
      row(),
      new Date("2026-08-10T10:20:00.000Z"),
    );
    const afterJoin = lectureMaterialAccessAt(
      row(new Date("2026-08-10T10:01:00.000Z")),
      new Date("2026-08-10T10:20:00.000Z"),
    );

    expect(withoutJoin).toMatchObject({
      available: false,
      mode: null,
      blockedReason: "not_joined",
    });
    expect(afterJoin).toMatchObject({
      available: true,
      mode: "live",
      blockedReason: null,
    });
  });

  it("unlocks the read-only archive at the scheduled end even if the lecture was missed", () => {
    const access = lectureMaterialAccessAt(row(), new Date("2026-08-10T11:00:00.000Z"));
    expect(access).toMatchObject({
      available: true,
      mode: "archive",
      blockedReason: null,
    });
    expect(access.endsAt.toISOString()).toBe("2026-08-10T11:00:00.000Z");
  });

  it("unlocks archive mode immediately after an administrator grants replay access", () => {
    const access = lectureMaterialAccessAt(
      { ...row(), replay_access_granted: true },
      new Date("2026-08-10T10:35:00.000Z"),
    );

    expect(access).toMatchObject({
      available: true,
      mode: "archive",
      blockedReason: null,
    });
  });

  it("keeps an admitted unfinished lecture live after the first-join window", () => {
    const access = lectureMaterialAccessAt(
      row(new Date("2026-08-10T10:01:00.000Z")),
      new Date("2026-08-10T12:00:00.000Z"),
    );
    expect(access).toMatchObject({
      available: true,
      mode: "live",
      blockedReason: null,
    });
  });

  it("switches a completed resumable lecture to its archive", () => {
    const access = lectureMaterialAccessAt(
      {
        ...row(new Date("2026-08-10T10:01:00.000Z")),
        completed_at: new Date("2026-08-10T10:55:00.000Z"),
      },
      new Date("2026-08-10T10:55:00.000Z"),
    );
    expect(access.mode).toBe("archive");
  });
});
