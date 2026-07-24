import { NextRequest } from "next/server";
import { now, getOffsetMs } from "@/lib/clock";
import { query } from "@/lib/db";
import { getAttendance, summarize } from "@/lib/attendance";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * SUDO endpoint: everything the system knows about ONE student. Admin+ only.
 * Multi-tenant: the admin picks the student with ?sid=<studentId>. Without it
 * we return the list of students so the panel can offer a picker.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const sid = request.nextUrl.searchParams.get("sid");
  if (!sid) {
    const students = await query(
      `SELECT "studentId" AS sid, name, email, role FROM "user" ORDER BY "createdAt" ASC`
    );
    return Response.json({ needsStudent: true, students });
  }

  const [virtualNow, offsetMs] = await Promise.all([now(), getOffsetMs()]);

  const [books, lectures, grades, qaLog] = await Promise.all([
    query("SELECT id, filename, title, pages, status, error, progress, uploaded_at FROM books WHERE student_id = $1 ORDER BY id DESC", [sid]),
    query("SELECT id, week, title, starts_at, status FROM lectures WHERE student_id = $1 ORDER BY week ASC", [sid]),
    query("SELECT id, kind, week, score, max_score, feedback, taken_at, flagged, report FROM grades WHERE student_id = $1 ORDER BY week ASC NULLS LAST, id ASC", [sid]),
    query("SELECT id, lecture_id, question, answer, citations, model_used, asked_at FROM qa_log WHERE student_id = $1 ORDER BY id DESC LIMIT 50", [sid]),
  ]);

  const attendance = await getAttendance(sid);

  return Response.json({
    clock: { now: virtualNow.toISOString(), offsetMs },
    books,
    lectures,
    attendance,
    attendanceSummary: summarize(attendance),
    grades,
    qaLog,
  });
}
