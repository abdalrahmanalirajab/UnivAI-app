import assert from "node:assert/strict";
import test from "node:test";

import {
  AssessmentBankOwnershipError,
  buildLearnerQuestionBankDocument,
} from "../lib/assessment-bank-ownership";

const chapter = { week: 1, chapter_id: "chapter-a", title: "Transactions" };
const questions = [{ prompt: "What is atomicity?", type: "mcq" }];

test("two learners bind reused teaching to separate assessment banks", () => {
  const first = buildLearnerQuestionBankDocument({
    scope: {
      sid: "S-2026-000005",
      student_id: "64b000000000000000000005",
      curriculum_id: "64c000000000000000000005",
    },
    chapter,
    sourceBookId: 8,
    sourceArtifactId: "lecture-for-first-learner",
    payload: {
      schema_version: "learner-assessment-bank-v1",
      owner_student_id: "S-2026-000005",
      owner_book_id: 8,
      generation_id: "generation-first",
      week: 1,
      questions,
    },
  });
  const second = buildLearnerQuestionBankDocument({
    scope: {
      sid: "S-2026-000006",
      student_id: "64b000000000000000000006",
      curriculum_id: "64c000000000000000000006",
    },
    chapter: { ...chapter, chapter_id: "chapter-b" },
    sourceBookId: 9,
    sourceArtifactId: "lecture-for-second-learner",
    payload: {
      schema_version: "learner-assessment-bank-v1",
      owner_student_id: "S-2026-000006",
      owner_book_id: 9,
      generation_id: "generation-second",
      week: 1,
      questions,
    },
  });

  assert.equal(first.owner_sid, "S-2026-000005");
  assert.equal(second.owner_sid, "S-2026-000006");
  assert.notEqual(first.student_id, second.student_id);
  assert.notEqual(first.curriculum_id, second.curriculum_id);
  assert.notEqual(first.chapter_id, second.chapter_id);
  assert.notEqual(first.source_generation_id, second.source_generation_id);
});

test("a donor-owned payload cannot be rebound to the adopter", () => {
  assert.throws(
    () =>
      buildLearnerQuestionBankDocument({
        scope: {
          sid: "S-2026-000006",
          student_id: "64b000000000000000000006",
          curriculum_id: "64c000000000000000000006",
        },
        chapter,
        sourceBookId: 9,
        sourceArtifactId: "adopted-lecture",
        payload: {
          schema_version: "learner-assessment-bank-v1",
          owner_student_id: "S-2026-000005",
          owner_book_id: 8,
          generation_id: "donor-generation",
          week: 1,
          questions,
        },
      }),
    AssessmentBankOwnershipError,
  );
});
