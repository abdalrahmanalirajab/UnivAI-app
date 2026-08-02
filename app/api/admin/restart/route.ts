import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { rescheduleLectures, semesterHasStarted } from "@/lib/lectures";
import { resetExamWorld } from "@/lib/exams";
import { requireAdminApi } from "@/lib/session";

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
export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  // A restart is per-student — wiping globally would destroy every learner's
  // progress. The admin panel must say which student (their studentId), and
  // the id is re-verified against the user table server-side: an admin action
  // never wipes rows for a client-supplied id that does not exist here.
  const body = await request.json().catch(() => ({}));
  const sid = body?.sid as string | undefined;
  if (!sid) {
    return Response.json(
      { error: "sid is required — a restart targets one student's semester." },
      { status: 400 }
    );
  }

  const target = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM "user" WHERE "studentId" = $1) AS exists`,
    [sid]
  );
  if (!target?.exists) {
    return Response.json({ error: "No such student." }, { status: 404 });
  }

  // A started plan's attendance and history are immutable: once virtual time
  // has reached the first lecture, wiping attendance/grades/QA and moving the
  // lecture times would rewrite history that already happened. Rejected
  // explicitly — never a silent no-op.
  const started = await semesterHasStarted(sid);
  if (started) {
    return Response.json(
      {
        error:
          "This student's plan has already started — attendance and history cannot be rewritten.",
        code: "PLAN_ALREADY_STARTED",
      },
      { status: 409 }
    );
  }

  await query("DELETE FROM attendance WHERE student_id = $1", [sid]);
  await query("DELETE FROM grades WHERE student_id = $1", [sid]);
  await query("DELETE FROM qa_log WHERE student_id = $1", [sid]);
  await resetExamWorld(sid);
  await rescheduleLectures(sid);
  return Response.json({ ok: true });
}
