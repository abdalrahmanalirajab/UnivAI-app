import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiBookUploader from "@/app/library/MultiBookUploader";

/* ------------------------------------------------------------------ */
/*  Mock db for programme plan tests (hoisted — vitest runs this first)*/
/* ------------------------------------------------------------------ */

const { mockQueryOne, mockQuery } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  queryOne: mockQueryOne,
  query: mockQuery,
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeProgramme(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    student_id: "S-2026-000001",
    collection_id: 1,
    name: "Test Programme",
    status: "proposed",
    plan_version: 2,
    plan: {
      semesters: [],
      courses: [],
      prerequisites: [],
      workload: { total_credits: 0, total_lecture_hours: 0, total_tutorial_hours: 0, total_lab_hours: 0, weeks_per_semester: 0 },
      source_coverage: [],
    },
    approved_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Test 1: one failed upload doesn't hide/block successful ones       */
/* ------------------------------------------------------------------ */

describe("MultiBookUploader — independent upload statuses", () => {
  beforeEach(() => {
    let callIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const i = callIdx++;
      if (i === 0) {
        return { ok: true, status: 201, json: async () => ({ document: { id: 1, filename: "a.pdf" } }) };
      }
      if (i === 1) {
        return { ok: false, status: 400, json: async () => ({ error: "File too large." }) };
      }
      return { ok: true, status: 201, json: async () => ({ document: { id: 3, filename: "c.pdf" } }) };
    });
  });

  it("marks each file independently: success, failure, success", async () => {
    const user = userEvent.setup();
    const onDocumentsChange = vi.fn();

    render(<MultiBookUploader collectionId={1} onDocumentsChange={onDocumentsChange} />);

    const input = document.querySelector('input[type="file"]')!;
    expect(input).not.toBeNull();

    const fileA = new File(["content-a"], "a.pdf", { type: "application/pdf" });
    const fileB = new File(["content-b"], "b.pdf", { type: "application/pdf" });
    const fileC = new File(["content-c"], "c.pdf", { type: "application/pdf" });

    await user.upload(input, [fileA, fileB, fileC]);

    await waitFor(() => {
      expect(screen.getByText("a.pdf")).toBeTruthy();
      expect(screen.getByText("c.pdf")).toBeTruthy();
    });

    const uploadChips = screen.queryAllByText("Uploaded");
    const failedChips = screen.queryAllByText("Failed");

    expect(uploadChips.length).toBeGreaterThanOrEqual(2);
    expect(failedChips.length).toBe(1);
    expect(onDocumentsChange).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Test 2: stale plan_version rejection (3f=update, 3e=approve)      */
/* ------------------------------------------------------------------ */

describe("Programme plan version — stale rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("3f — updateProgrammePlan", () => {
    it("rejects edit when plan_version !== expectedVersion", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2 }));

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme().plan, 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
        expect(result.current.plan_version).toBe(2);
      }
    });

    it("rejects edit when concurrent UPDATE returns no rows", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2 }))
        .mockResolvedValueOnce(null);

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme({ plan_version: 2 }).plan, 2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
      }
    });

    it("accepts edit when plan_version matches and UPDATE succeeds", async () => {
      const { updateProgrammePlan } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2 }))
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 3 }));

      const result = await updateProgrammePlan(1, "S-2026-000001", fakeProgramme({ plan_version: 2 }).plan, 2);

      expect(result.ok).toBe(true);
    });
  });

  describe("3e — approveProgramme", () => {
    it("rejects approval when plan_version does not match", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2 }));

      const result = await approveProgramme(1, "S-2026-000001", 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
        expect(result.current.plan_version).toBe(2);
      }
    });

    it("rejects approval when concurrent UPDATE returns no rows", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "proposed" }))
        .mockResolvedValueOnce(null);

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Stale plan version. Refresh and try again.");
      }
    });

    it("rejects approval when programme is already approved", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne.mockResolvedValue(fakeProgramme({ plan_version: 2, status: "approved" }));

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Programme is already approved.");
      }
    });

    it("accepts approval when plan_version matches and UPDATE succeeds", async () => {
      const { approveProgramme } = await import("@/lib/programmes");

      mockQueryOne
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "proposed" }))
        .mockResolvedValueOnce(fakeProgramme({ plan_version: 2, status: "approved", approved_at: "2026-07-28T00:00:00Z" }));

      const result = await approveProgramme(1, "S-2026-000001", 2);

      expect(result.ok).toBe(true);
    });
  });
});
