import { NextRequest } from "next/server";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { REPO_ROOT } from "@/lib/python";
import { spawnGeneration } from "@/lib/generation";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode;
  const sid = body?.sid as string | undefined;

  if (!sid) {
    return Response.json(
      { error: "sid is required — regeneration targets one student's book." },
      { status: 400 }
    );
  }
  if (mode !== "full" && mode !== "quizzes") {
    return Response.json({ error: 'mode must be "full" or "quizzes"' }, { status: 400 });
  }

  const book = await queryOne<{ id: number; filename: string; status: string }>(
    "SELECT id, filename, status FROM books WHERE student_id = $1 ORDER BY id DESC LIMIT 1",
    [sid]
  );
  if (!book) {
    return Response.json({ error: "No book uploaded — there is nothing to regenerate." }, { status: 409 });
  }
  if (book.status === "generating" || book.status === "ingesting") {
    return Response.json({ error: "A build is already running — wait for it to finish." }, { status: 409 });
  }

  await query(
    `UPDATE books SET status = 'generating', error = NULL,
        progress = $1 WHERE id = $2`,
    [
      mode === "full"
        ? "Rebuilding the course — lectures, quizzes and voice…"
        : "Rewriting the generated question banks…",
      book.id,
    ]
  );
  spawnGeneration(
    path.join(REPO_ROOT, "uploads", sid, book.filename),
    book.id,
    // "rebuild", never "full": an admin asking to regenerate wants this book
    // written again. Course reuse would find the identical course this one was
    // adopted from and hand back the same content, so the button would appear
    // to work and change nothing.
    mode === "quizzes" ? "quizzes" : "rebuild",
  );

  return Response.json({ ok: true, mode });
}
