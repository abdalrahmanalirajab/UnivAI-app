import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockNow, mockQuery } = vi.hoisted(() => ({
  mockNow: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/clock", () => ({ now: mockNow, MINUTE_MS: 60_000 }));
vi.mock("@/lib/db", () => ({ query: mockQuery }));

import {
  getApprovedLectureMakeups,
  startLectureMakeup,
} from "@/lib/lecture-makeup";

const LECTURE_ID = "11111111-1111-4111-8111-111111111111";
const CONFIRMED_AT = new Date("2026-08-12T14:00:00.000Z");
const ROW = {
  item_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  lecture_public_id: LECTURE_ID,
  week: 2,
  title: "Storage engines",
  makeup_started_at: null,
  joined_at: null,
  completed_at: null,
  script_payload: { durationMinutes: 60 },
};

describe("one-time lecture make-up state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNow.mockResolvedValue(new Date("2026-08-12T13:00:00.000Z"));
    mockQuery.mockResolvedValue([ROW]);
  });

  it("starts as ready and exposes no clock until the learner confirms", async () => {
    const makeup = (await getApprovedLectureMakeups("S-2026-000001")).get(LECTURE_ID);

    expect(makeup).toMatchObject({
      state: "ready",
      title: "Storage engines",
      startedAt: null,
      firstJoinCutoffAt: null,
    });
  });

  it("uses confirmation as the effective start and expires an unused first join", async () => {
    mockNow.mockResolvedValue(new Date("2026-08-12T14:30:01.000Z"));
    mockQuery.mockResolvedValue([{ ...ROW, makeup_started_at: CONFIRMED_AT }]);

    const makeup = (await getApprovedLectureMakeups("S-2026-000001")).get(LECTURE_ID);

    expect(makeup).toMatchObject({
      state: "expired",
      startedAt: CONFIRMED_AT,
      firstJoinCutoffAt: new Date("2026-08-12T14:30:00.000Z"),
      endsAt: new Date("2026-08-12T15:00:00.000Z"),
    });
  });

  it("keeps a joined make-up active for normal checkpoint-based reconnection", async () => {
    mockNow.mockResolvedValue(new Date("2026-08-13T14:00:00.000Z"));
    mockQuery.mockResolvedValue([{
      ...ROW,
      makeup_started_at: CONFIRMED_AT,
      joined_at: new Date("2026-08-12T14:01:00.000Z"),
    }]);

    const makeup = (await getApprovedLectureMakeups("S-2026-000001")).get(LECTURE_ID);
    expect(makeup?.state).toBe("active");
  });

  it("records confirmation once and never resets an existing start", async () => {
    mockNow.mockResolvedValue(CONFIRMED_AT);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE absence_case_items")) return [{ id: ROW.item_id }];
      return [{ ...ROW, makeup_started_at: CONFIRMED_AT }];
    });

    const makeup = await startLectureMakeup("S-2026-000001", LECTURE_ID);

    expect(makeup?.state).toBe("active");
    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE absence_case_items"),
    );
    expect(String(update?.[0])).toContain("item.makeup_started_at IS NULL");
    expect(update?.[1]).toEqual(["S-2026-000001", LECTURE_ID, CONFIRMED_AT]);
  });
});
