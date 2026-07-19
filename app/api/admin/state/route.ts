import { now, getOffsetMs } from "@/lib/clock";
import { query } from "@/lib/db";
import { getAttendance, summarize } from "@/lib/attendance";

export const dynamic = "force-dynamic";

/** SUDO endpoint: everything the system knows about the student. No auth (MVP-1, local demo only). */
export async function GET() {
  const [virtualNow, offsetMs] = await Promise.all([now(), getOffsetMs()]);

  const [books, lectures, grades, qaLog] = await Promise.all([
    query("SELECT id, filename, title, pages, status, error, progress, uploaded_at FROM books ORDER BY id DESC"),
    query("SELECT id, week, title, starts_at, status FROM lectures ORDER BY week ASC"),
    query("SELECT id, kind, week, score, max_score, feedback, taken_at, flagged, report FROM grades ORDER BY week ASC NULLS LAST, id ASC"),
    query("SELECT id, lecture_id, question, answer, citations, model_used, asked_at FROM qa_log ORDER BY id DESC LIMIT 50"),
  ]);

  const attendance = await getAttendance();

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
