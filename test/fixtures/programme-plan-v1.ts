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

export type CourseStructure = {
  course_id: string;
  chapter_count: number;
  semesters: Array<{
    semester: number;
    week_count: number;
    theoretical_lectures: number;
    practical_sections: number;
    quizzes: number;
    midterms: number;
    finals: number;
  }>;
};

export type ProgrammePlanV1 = {
  semesters: Semester[];
  courses: Course[];
  prerequisites: Prerequisite[];
  workload: Workload;
  source_coverage: SourceCoverage[];
  /** Chapter-derived teaching and assessment cadence for generated courses. */
  course_structure?: CourseStructure[];
  /** Agent-owned versioned contract; absent until cross-book analysis completes. */
  learning_path?: LearningPathV1 | null;
  /** Human edits that changed the serial order or resolved an override. */
  learning_path_audit?: Array<{
    operation: "reorder" | "override";
    reason: string;
    recorded_at: string;
  }>;
};
import type { LearningPathV1 } from "./learning-path-v1";
