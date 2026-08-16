import "server-only";

import { query } from "./db";

/**
 * Lecture ids with a final, administrator-approved anytime replay remedy.
 *
 * Attendance remains unchanged: this grants material access only. Requiring
 * both the approved case state and the stored replay remedy prevents an
 * unfinished or rejected appeal from unlocking lecture material.
 */
export async function getApprovedLectureReplayIds(studentId: string): Promise<Set<string>> {
  const rows = await query<{ lecture_public_id: string }>(
    `SELECT DISTINCT item.lecture_public_id::text AS lecture_public_id
       FROM absence_case_items AS item
       JOIN absence_cases AS absence_case
         ON absence_case.id = item.case_id
        AND absence_case.student_id = item.student_id
      WHERE item.student_id = $1
        AND item.item_type = 'lecture'
        AND item.lecture_public_id IS NOT NULL
        AND item.remedy = 'replay'
        AND absence_case.status = 'approved'`,
    [studentId],
  );
  return new Set(rows.map((row) => row.lecture_public_id));
}
