/**
 * Approved programme plans v1 — Day-1 fixtures.
 *
 * Temporary source of truth for the approved plans the schedule is built
 * from: approvedWeekCount (lib/lectures.ts) reads the approved programme's
 * workload.weeks_per_semester and seeds exactly that many weekly lectures,
 * so each fixture here fixes how many lecture entries the schedule must
 * render. Consumed as the plan payload of an approved programme row (the
 * approve flow in app/api/programmes/[programmeId]/approve/route.ts sets
 * status = 'approved').
 *
 * Values follow the Demo Contract's BASE_PLAN (test/demo-contract.e2e.ts) —
 * same courses, workload totals and source coverage, differing only in
 * weeks_per_semester. Swap for the real Core plan contract later without
 * changing field names.
 *
 * Schema version: 1.0.0
 */

import type { ProgrammePlanV1 } from "./programme-plan-v1";

/** 3-week plan: exactly 3 weekly lectures (weeks 1–3) when approved. */
export const THREE_WEEK_PLAN_V1: ProgrammePlanV1 = {
  semesters: [
    { id: "sem-1", name: "Semester 1", order: 1, course_ids: ["c-1", "c-2"] },
  ],
  courses: [
    {
      id: "c-1",
      title: "Introduction to AI",
      credits: 4,
      lecture_hours: 30,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Fundamentals of artificial intelligence.",
    },
    {
      id: "c-2",
      title: "Calculus I",
      credits: 3,
      lecture_hours: 20,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Single-variable calculus.",
    },
  ],
  prerequisites: [],
  workload: {
    total_credits: 7,
    total_lecture_hours: 50,
    total_tutorial_hours: 20,
    total_lab_hours: 0,
    weeks_per_semester: 3,
  },
  source_coverage: [
    { document_id: 1, filename: "ai-textbook.pdf", course_ids: ["c-1"], pages: "1–350" },
    { document_id: 2, filename: "calculus-book.pdf", course_ids: ["c-2"], pages: "1–280" },
    { document_id: 3, filename: "reference.pdf", course_ids: ["c-1", "c-2"], pages: "1–120" },
  ],
};

/**
 * 7-week plan: exactly 7 weekly lectures (weeks 1–7) when approved — the
 * Demo Contract's plan (test/demo-contract.e2e.ts BASE_PLAN data) with
 * weeks_per_semester 7. The two SectionPacks this fixture pairs with live
 * in SECTION_PACKS_V1 (test/fixtures/section-pack-v1.ts): weeks 1 and 5.
 */
export const SEVEN_WEEK_PLAN_V1: ProgrammePlanV1 = {
  semesters: [
    { id: "sem-1", name: "Semester 1", order: 1, course_ids: ["c-1", "c-2"] },
  ],
  courses: [
    {
      id: "c-1",
      title: "Introduction to AI",
      credits: 4,
      lecture_hours: 30,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Fundamentals of artificial intelligence.",
    },
    {
      id: "c-2",
      title: "Calculus I",
      credits: 3,
      lecture_hours: 20,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Single-variable calculus.",
    },
  ],
  prerequisites: [],
  workload: {
    total_credits: 7,
    total_lecture_hours: 50,
    total_tutorial_hours: 20,
    total_lab_hours: 0,
    weeks_per_semester: 7,
  },
  source_coverage: [
    { document_id: 1, filename: "ai-textbook.pdf", course_ids: ["c-1"], pages: "1–350" },
    { document_id: 2, filename: "calculus-book.pdf", course_ids: ["c-2"], pages: "1–280" },
    { document_id: 3, filename: "reference.pdf", course_ids: ["c-1", "c-2"], pages: "1–120" },
  ],
};

/**
 * 14-week plan: exactly 14 weekly lectures (weeks 1–14) when approved — the
 * Demo Contract's own plan: identical to test/demo-contract.e2e.ts BASE_PLAN
 * (same courses, workload totals, source coverage and weeks_per_semester).
 */
export const FOURTEEN_WEEK_PLAN_V1: ProgrammePlanV1 = {
  semesters: [
    { id: "sem-1", name: "Semester 1", order: 1, course_ids: ["c-1", "c-2"] },
  ],
  courses: [
    {
      id: "c-1",
      title: "Introduction to AI",
      credits: 4,
      lecture_hours: 30,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Fundamentals of artificial intelligence.",
    },
    {
      id: "c-2",
      title: "Calculus I",
      credits: 3,
      lecture_hours: 20,
      tutorial_hours: 10,
      lab_hours: 0,
      description: "Single-variable calculus.",
    },
  ],
  prerequisites: [],
  workload: {
    total_credits: 7,
    total_lecture_hours: 50,
    total_tutorial_hours: 20,
    total_lab_hours: 0,
    weeks_per_semester: 14,
  },
  source_coverage: [
    { document_id: 1, filename: "ai-textbook.pdf", course_ids: ["c-1"], pages: "1–350" },
    { document_id: 2, filename: "calculus-book.pdf", course_ids: ["c-2"], pages: "1–280" },
    { document_id: 3, filename: "reference.pdf", course_ids: ["c-1", "c-2"], pages: "1–120" },
  ],
};
