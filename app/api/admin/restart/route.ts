import { query } from "@/lib/db";
import { rescheduleLectures } from "@/lib/lectures";
import { resetExamWorld } from "@/lib/exams";

export const dynamic = "force-dynamic";

/**
 * Restart the semester. Wipes the student's PROGRESS — attendance, grades with
 * their proctoring reports, the live-lecture Q&A log, and every exam-system
 * attempt (sessions, results, integrity events) — then moves the 4-week
 * schedule to a fresh start: tomorrow 10:00 virtual time, then weekly.
 *
 * The generated course CONTENT is untouched: slides, scripts, quizzes and the
 * pre-rendered voice stay exactly as built. The exam world (chapters, question
 * banks, midterm) re-seeds itself on the next exam start.
 */
export async function POST() {
  await query("DELETE FROM attendance");
  await query("DELETE FROM grades");
  await query("DELETE FROM qa_log");
  await resetExamWorld();
  await rescheduleLectures();
  return Response.json({ ok: true });
}
