/**
 * SectionPack v1 — Day-1 fixture.
 *
 * Temporary source of truth for the per-week section records that the
 * schedule lists alongside lectures. Section packs are Agent-owned
 * (chapter/teaching generation, UnivAI-Agent) and are not produced yet, so
 * the App consumes this versioned fixture until the real producer lands.
 * Swap for the real Agent section contract later without changing field
 * names.
 *
 * The only teaching-unit kinds this repo knows today come from the
 * approved plan's Course hours (ProgrammePlanV1: lecture_hours,
 * tutorial_hours, lab_hours), so a section's kind is one of those.
 *
 * Schema version: 1.0.0
 */

export type SectionKind = "lecture" | "tutorial" | "lab";

export type SectionV1 = {
  id: string;
  week: number;
  kind: SectionKind;
  title: string;
};

export type SectionPackV1 = {
  week: number;
  sections: SectionV1[];
};

/**
 * The real, approved section records the schedule consumes today. Agent
 * packs are not produced yet, so the 6b richer demo fixture stands in: the
 * 7-week Demo Contract plan (SEVEN_WEEK_PLAN_V1) pairs with two tutorial
 * packs here — week 1 (the e2e spec advances virtual time through lecture 1
 * and its section) and week 5 (mid-semester, this fixture's own contract).
 * A week without an entry here never gets a section scheduled — never
 * speculatively. When the real producer lands, extend/replace this array
 * without changing field names.
 */
export const SECTION_PACKS_V1: SectionPackV1[] = [
  {
    week: 1,
    sections: [
      { id: "w1-tutorial", week: 1, kind: "tutorial", title: "Introduction to AI — Tutorial" },
    ],
  },
  {
    week: 5,
    sections: [
      { id: "w5-tutorial", week: 5, kind: "tutorial", title: "Calculus I — Tutorial" },
    ],
  },
];
