import { query } from "./db";
import { ensureExamWorld } from "./exams";
import { finalExamWindowAt } from "./final-exam-policy";
import {
  ensureFinalExamCase,
  reconcileDueFinalExamCases,
  type FinalizationOutcome,
} from "./final-exam-retakes";
import { getLectures } from "./lectures";

/**
 * Ensure even learners who never open /exams receive an absentee case. This is
 * called by the existing notification dispatcher, whose virtual-clock cadence
 * also drives other due academic events.
 */
export async function ensureAndReconcileScheduledFinals(
  referenceTime: Date,
): Promise<FinalizationOutcome[]> {
  const learners = await query<{ student_id: string; name: string }>(
    `SELECT DISTINCT learner."registrationNumber" AS student_id, learner.name
       FROM "user" AS learner
       JOIN lectures AS lecture
         ON lecture.student_id = learner."registrationNumber"
      WHERE learner."registrationNumber" IS NOT NULL
      ORDER BY learner."registrationNumber"`,
  );

  for (const learner of learners) {
    try {
      const lectures = await getLectures(learner.student_id);
      const window = finalExamWindowAt(
        referenceTime,
        lectures.map((lecture) => lecture.endsAt),
      );
      if (!window.opensAt || referenceTime < window.opensAt) continue;
      const link = await ensureExamWorld(learner.student_id, learner.name);
      await ensureFinalExamCase({
        studentId: learner.student_id,
        curriculumId: link.curriculum_id,
        window,
      });
    } catch (error) {
      console.error(`[finals] could not prepare policy case for ${learner.student_id}:`, error);
    }
  }
  return reconcileDueFinalExamCases(referenceTime);
}
