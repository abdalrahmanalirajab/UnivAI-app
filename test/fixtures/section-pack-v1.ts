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
 * packs are not produced yet, so this stays empty: a week without an entry
 * here never gets a section scheduled — never speculatively. When the real
 * producer lands (or a richer demo fixture is added), extend this array
 * without changing field names.
 */
export const SECTION_PACKS_V1: SectionPackV1[] = [];
