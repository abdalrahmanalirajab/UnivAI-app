/**
 * ProgrammePlan v1 — Day-1 fixture.
 *
 * Temporary source of truth for the programme plan shape. Swap for real Core
 * endpoint later without changing field names.
 *
 * Schema version: 1.0.0
 */

export type Semester = {
  id: string;
  name: string;
  order: number;
  course_ids: string[];
};

export type Course = {
  id: string;
  title: string;
  credits: number;
  lecture_hours: number;
  tutorial_hours: number;
  lab_hours: number;
  description: string;
};

export type Prerequisite = {
  course_id: string;
  requires: string[];
};

export type Workload = {
  total_credits: number;
  total_lecture_hours: number;
  total_tutorial_hours: number;
  total_lab_hours: number;
  weeks_per_semester: number;
};

export type SourceCoverage = {
  document_id: number;
  filename: string;
  course_ids: string[];
  pages: string;
};

export type ProgrammePlanV1 = {
  semesters: Semester[];
  courses: Course[];
  prerequisites: Prerequisite[];
  workload: Workload;
  source_coverage: SourceCoverage[];
  /** Agent-owned versioned contract; absent until cross-book analysis completes. */
  learning_path?: LearningPathV1;
  /** Human edits that changed the serial order or resolved an override. */
  learning_path_audit?: Array<{
    operation: "reorder" | "override";
    reason: string;
    recorded_at: string;
  }>;
};
import type { LearningPathV1 } from "./learning-path-v1";
