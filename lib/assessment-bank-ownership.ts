import { createHash } from "node:crypto";

export const LEARNER_BANK_SCHEMA_VERSION = "learner-assessment-bank-v1";
export const LEARNER_BANK_BINDING_VERSION = "learner-question-bank-binding-v1";

export type GeneratedLearnerQuizBank = {
  schema_version?: string;
  owner_student_id?: string;
  owner_book_id?: number;
  generation_id?: string;
  week?: number;
  title?: string;
  questions?: unknown[];
};

export type LearnerBankScope = {
  sid: string;
  student_id: string;
  curriculum_id: string;
};

export type LearnerBankChapter = {
  week: number;
  chapter_id: string;
  title: string;
};

export class AssessmentBankOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentBankOwnershipError";
  }
}

/** Validate Postgres ownership before any generated questions enter Mongo. */
export function buildLearnerQuestionBankDocument(input: {
  scope: LearnerBankScope;
  chapter: LearnerBankChapter;
  sourceBookId: number;
  sourceArtifactId: string;
  payload: GeneratedLearnerQuizBank;
  updatedAt?: Date;
}) {
  const { scope, chapter, payload, sourceBookId, sourceArtifactId } = input;
  if (
    payload.schema_version !== LEARNER_BANK_SCHEMA_VERSION ||
    payload.owner_student_id !== scope.sid ||
    payload.owner_book_id !== sourceBookId ||
    payload.week !== chapter.week ||
    typeof payload.generation_id !== "string" ||
    !payload.generation_id.trim() ||
    !Array.isArray(payload.questions) ||
    payload.questions.length === 0
  ) {
    throw new AssessmentBankOwnershipError(
      `Week ${chapter.week} assessment bank is not owned by ${scope.sid}; regenerate its quizzes.`,
    );
  }

  return {
    schema_version: LEARNER_BANK_BINDING_VERSION,
    owner_sid: scope.sid,
    student_id: scope.student_id,
    curriculum_id: scope.curriculum_id,
    chapter_id: chapter.chapter_id,
    week: chapter.week,
    title: payload.title?.trim() || chapter.title,
    source_book_id: sourceBookId,
    source_artifact_id: sourceArtifactId,
    source_generation_id: payload.generation_id,
    questions_hash: createHash("sha256")
      .update(JSON.stringify(payload.questions))
      .digest("hex"),
    questions: payload.questions,
    updated_at: input.updatedAt ?? new Date(),
  };
}
