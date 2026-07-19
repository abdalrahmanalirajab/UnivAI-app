import { NextRequest } from "next/server";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { REPO_ROOT } from "@/lib/python";
import { spawnGeneration } from "@/lib/generation";
import { getSetting, setSetting } from "@/lib/settings";
import { COURSE_SIZES, DEFAULT_SIZE, isCourseSize } from "@/lib/course-size";

export const dynamic = "force-dynamic";

/**
 * The admin's course-size dial. GET the current size; POST a size and a mode
 * ("full" rebuilds lectures + quizzes + voice, "quizzes" rewrites only the
 * question banks) and the course regenerates from the already-uploaded book.
 */

export async function GET() {
  const size = await getSetting("course_size");
  return Response.json({
    size: isCourseSize(size) ? size : DEFAULT_SIZE,
    sizes: COURSE_SIZES,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const size = body?.size;
  const mode = body?.mode;

  if (!isCourseSize(size)) {
    return Response.json({ error: "size must be one of XS, S, M, L, XL" }, { status: 400 });
  }
  if (mode !== "full" && mode !== "quizzes") {
    return Response.json({ error: 'mode must be "full" or "quizzes"' }, { status: 400 });
  }

  const book = await queryOne<{ id: number; filename: string; status: string }>(
    "SELECT id, filename, status FROM books ORDER BY id DESC LIMIT 1"
  );
  if (!book) {
    return Response.json({ error: "No book uploaded — there is nothing to regenerate." }, { status: 409 });
  }
  if (book.status === "generating" || book.status === "ingesting") {
    return Response.json({ error: "A build is already running — wait for it to finish." }, { status: 409 });
  }

  await setSetting("course_size", size);
  await query(
    `UPDATE books SET status = 'generating', error = NULL,
        progress = $1 WHERE id = $2`,
    [
      mode === "full"
        ? `Rebuilding the course at size ${size} — lectures, quizzes and voice…`
        : `Rewriting the quizzes at size ${size}…`,
      book.id,
    ]
  );
  spawnGeneration(path.join(REPO_ROOT, "uploads", book.filename), book.id, mode === "quizzes");

  return Response.json({ ok: true, size, mode });
}
