import { spawn } from "child_process";
import { mkdirSync, openSync } from "fs";
import path from "path";
import { query, queryOne } from "./db";
import { AGENT_PYTHON, REPO_ROOT } from "./python";
import { isStandalone } from "./runtime";

/**
 * Fire course generation (UnivAI-Agent/generation/lecture_gen.py — the Brain
 * cave) detached, so it outlives the HTTP request that asked for it. Progress
 * is reported through books.progress; output lands in logs/lecture-gen.log.
 */
/**
 * "plan" discovers the book's chapters and stops, leaving the book in
 * awaiting_approval — that is all the curriculum needs, and it is the only
 * thing worth doing before a learner has approved what they are about to be
 * taught. "full" stores lectures, quizzes, slides, and sections in Postgres.
 * "quizzes" rewrites only the database question banks.
 *
 * "rebuild" is "full" with course reuse switched off. A learner reaching this
 * book for the first time should adopt an identical course rather than pay to
 * write it twice, but an admin pressing "Regenerate course" is asking for new
 * content on purpose — silently handing back a copy of the donor would make
 * the button a no-op.
 */
export type GenerationMode = "full" | "plan" | "quizzes" | "rebuild";

export function spawnGeneration(
  pdfPath: string,
  bookId: number,
  mode: GenerationMode = "full",
): number | null {
  if (isStandalone()) {
    console.info(
      `[standalone] generation fixture selected for book ${bookId}; Python, Slidev, and voice were skipped`
    );
    return null;
  }
  mkdirSync(path.join(REPO_ROOT, "logs"), { recursive: true });
  const log = openSync(path.join(REPO_ROOT, "logs", "lecture-gen.log"), "a");
  const args = [
    path.join(REPO_ROOT, "UnivAI-Agent", "generation", "lecture_gen.py"),
    pdfPath,
    String(bookId),
  ];
  if (mode === "quizzes") args.push("--quizzes-only");
  if (mode === "plan") args.push("--plan-only");
  if (mode === "rebuild") args.push("--no-reuse");

  const child = spawn(AGENT_PYTHON, args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    detached: true,
    stdio: ["ignore", log, log],
    // Log lines carry generated titles; without this, one character outside
    // the console codepage kills the whole run with UnicodeEncodeError.
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  const pid = child.pid ?? null;
  if (pid) {
    void query("UPDATE books SET generation_pid = $1 WHERE id = $2", [pid, bookId]);
    child.once("close", () => {
      void query(
        "UPDATE books SET generation_pid = NULL WHERE id = $1 AND generation_pid = $2",
        [bookId, pid],
      ).catch(() => undefined);
    });
  }
  child.unref();
  return pid;
}

/** Stop only the process attached to this learner-owned source, if still alive. */
export async function cancelGenerationForSource(
  studentId: string,
  storageKey: string,
): Promise<void> {
  const book = await queryOne<{ id: number; generation_pid: number | null }>(
    `SELECT id, generation_pid FROM books WHERE student_id = $1 AND filename = $2`,
    [studentId, storageKey],
  );
  const pid = book?.generation_pid;
  if (!pid || !Number.isInteger(pid) || pid < 1) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  await query(
    "UPDATE books SET generation_pid = NULL WHERE id = $1 AND student_id = $2",
    [book.id, studentId],
  );
}

/**
 * Build the courses a learner has just approved.
 *
 * Until approval each book holds nothing but its chapter plan
 * (awaiting_approval), because the curriculum they approve is assembled from
 * that plan and reshaping it afterwards would discard every lecture written
 * against the old one. Approval is therefore what starts the real work.
 *
 * Returns the books it started, so the caller can report how many.
 */
export async function startApprovedCourseBuild(
  collectionId: number,
  studentId: string,
): Promise<number[]> {
  const books = await query<{ id: number; filename: string }>(
    `SELECT id, filename FROM books
      WHERE student_id = $1
        AND filename LIKE 'collections/' || $2::text || '/%'
        AND status IN ('awaiting_approval', 'failed', 'partial_failed', 'partial')`,
    [studentId, collectionId],
  );

  for (const book of books) {
    await query(
      `UPDATE books SET status = 'generating', generation_stage = 'resuming',
          error = NULL, progress = 'Building your approved course…',
          heartbeat_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND student_id = $2`,
      [book.id, studentId],
    );
    spawnGeneration(
      path.join(REPO_ROOT, "uploads", studentId, ...book.filename.split("/")),
      book.id,
      "full",
    );
  }
  return books.map((book) => book.id);
}
