import { NextRequest } from "next/server";
import { now, getOffsetMs } from "@/lib/clock";
import { query } from "@/lib/db";
import { getAttendance, summarize } from "@/lib/attendance";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * SUDO endpoint: everything the system knows about ONE student. Admin+ only.
 * Multi-tenant: the admin picks the student with ?sid=<registrationNumber>.
 * Learner discovery happens through the bounded /api/admin/learners endpoint.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  // Learner discovery is a separate, bounded endpoint. This state endpoint is
  // polled during generation, so it must never re-send every account.
  const [virtualNow, offsetMs] = await Promise.all([now(), getOffsetMs()]);
  const clock = { now: virtualNow.toISOString(), offsetMs };

  const sid = request.nextUrl.searchParams.get("sid");
  if (!sid) {
    return Response.json({ needsStudent: true, clock });
  }
  const learner = await query<{ sid: string; name: string; email: string; role: string }>(
    `SELECT "registrationNumber" AS sid, name, email, COALESCE(role, 'student') AS role
       FROM "user" WHERE "registrationNumber" = $1 LIMIT 1`,
    [sid],
  );
  if (!learner[0]) {
    return Response.json({ error: "Learner not found." }, { status: 404 });
  }

  const [books, lectures, grades, qaLog] = await Promise.all([
    query("SELECT id, filename, title, pages, status, error, progress, uploaded_at FROM books WHERE student_id = $1 ORDER BY id DESC", [sid]),
    query("SELECT public_id::text AS id, week, title, starts_at, status FROM lectures WHERE student_id = $1 ORDER BY week ASC", [sid]),
    query("SELECT id, kind, week, score, max_score, feedback, taken_at, flagged, report FROM grades WHERE student_id = $1 ORDER BY week ASC NULLS LAST, id ASC", [sid]),
    query(`SELECT q.id, l.public_id::text AS lecture_id, q.question, q.answer,
                  q.citations, q.model_used, q.asked_at
             FROM qa_log q
             JOIN lectures l ON l.id = q.lecture_id AND l.student_id = q.student_id
            WHERE q.student_id = $1 ORDER BY q.id DESC LIMIT 50`, [sid]),
  ]);

  const attendance = await getAttendance(sid);

  return Response.json({
    clock,
    learner: learner[0],
    sid,
    books,
    lectures,
    attendance,
    attendanceSummary: summarize(attendance),
    grades,
    qaLog,
  });
}
