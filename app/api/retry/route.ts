import { NextRequest } from "next/server";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { REPO_ROOT } from "@/lib/python";
import { spawnGeneration } from "@/lib/generation";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Retry generation for a real book: re-spawns the course pipeline for the
 * book that produced the output being retried. Previous qa_log rows are
 * retained untouched — nothing is deleted, so retention of the previous
 * output is inherent.
 *
 * Honest scope: the only real generation mechanism is lib/generation.ts
 * spawnGeneration, which reports through books.status / books.progress and
 * returns nothing. No output_version / trace_id storage exists yet (see
 * docs/proposed-output-versions-ddl.md), so this route keys on the real book
 * identity and returns real book state only — it does not mint or claim
 * version tokens that nothing would persist.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { bookId } = body as Record<string, unknown>;

  if (typeof bookId !== "number" || !Number.isInteger(bookId) || bookId < 1) {
    return Response.json({ error: "bookId must be a positive integer." }, { status: 400 });
  }

  const book = await queryOne<{ id: number; filename: string; status: string }>(
    "SELECT id, filename, status FROM books WHERE id = $1 AND student_id = $2",
    [bookId, gate.studentId]
  );
  if (!book) {
    return Response.json({ error: "No such book." }, { status: 404 });
  }
  if (book.status === "generating" || book.status === "ingesting") {
    return Response.json(
      { error: "A build is already running — wait for it to finish." },
      { status: 409 }
    );
  }

  await query(
    `UPDATE books SET status = 'generating', error = NULL,
        progress = $1 WHERE id = $2`,
    ["Retrying the generation — re-running lectures, quizzes and voice…", book.id]
  );
  spawnGeneration(
    path.join(REPO_ROOT, "uploads", gate.studentId, book.filename),
    book.id,
    false
  );

  return Response.json({ ok: true, bookId: book.id, status: "generating" });
}
