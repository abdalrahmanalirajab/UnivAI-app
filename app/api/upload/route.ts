import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { now } from "@/lib/clock";
import { runPython, parseJsonLine, REPO_ROOT } from "@/lib/python";
import { resetExamWorld } from "@/lib/exams";
import { spawnGeneration } from "@/lib/generation";
import { requireUserApi } from "@/lib/session";
import { env } from "@/lib/env";
import { isStandalone } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_BYTES = 60 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

/**
 * The book IS the course. Uploading one (or replacing it) means:
 *   1. clear the old book out of the RAG and wipe the course state
 *      (lectures, attendance, grades, the exam system's chapters and banks)
 *   2. index the new book — the RAG service's job, reached over MCP
 *   3. generate the 4 weekly lectures + quizzes from it (lecture_gen.py,
 *      detached — the upload page polls books.progress while it runs)
 */
const RAG_MCP_URL = env.RAG_MCP_URL;

type Book = {
  id: number;
  filename: string;
  title: string | null;
  pages: number;
  status: string;
  error: string | null;
  progress: string | null;
};

const BOOK_COLUMNS = "id, filename, title, pages, status, error, progress";

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const books = await query<Book & { uploaded_at: string }>(
    `SELECT ${BOOK_COLUMNS}, uploaded_at FROM books WHERE student_id = $1 ORDER BY id DESC`,
    [gate.studentId]
  );
  return Response.json({
    books,
    book: books[0] ?? null,
    ragConfigured: isStandalone() || Boolean(RAG_MCP_URL),
  });
}

/** Everything this student's old course was: gone. Scoped — never touches others. */
async function resetCourse(sid: string): Promise<void> {
  await query("DELETE FROM grades WHERE student_id = $1", [sid]);
  await query("DELETE FROM attendance WHERE student_id = $1", [sid]);
  await query("DELETE FROM qa_log WHERE student_id = $1", [sid]);
  await query("DELETE FROM lectures WHERE student_id = $1", [sid]);
  await query("DELETE FROM books WHERE student_id = $1", [sid]);
  await resetExamWorld(sid);
}

export async function POST(request: NextRequest) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 60 MB.` },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== PDF_MAGIC) {
    return Response.json(
      { error: "That file is not a real PDF — its contents do not start with %PDF-." },
      { status: 400 }
    );
  }

  if (isStandalone()) {
    await query("DELETE FROM grades WHERE student_id = $1", [sid]);
    await query("DELETE FROM attendance WHERE student_id = $1", [sid]);
    await query("DELETE FROM lectures WHERE student_id = $1", [sid]);
    await query("DELETE FROM books WHERE student_id = $1", [sid]);
    const uploadedAt = await now();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const created = await queryOne<{ id: number }>(
      `INSERT INTO books (student_id, filename, title, pages, status, uploaded_at, progress)
       VALUES ($1, $2, $3, 4, 'ready', $4, 'Standalone fixture course ready')
       RETURNING id`,
      [sid, safeName, safeName, uploadedAt]
    );
    await query(
      `INSERT INTO lectures (student_id, book_id, week, title, starts_at, status)
       SELECT $1, $2, week, title, starts_at, 'ready'
       FROM (VALUES
         (1, 'Evidence and Sources', TIMESTAMPTZ '2026-07-28T10:00:00Z'),
         (2, 'Tenant Isolation', TIMESTAMPTZ '2026-08-04T10:00:00Z'),
         (3, 'Explicit Runtime Modes', TIMESTAMPTZ '2026-08-11T10:00:00Z'),
         (4, 'Stable Contracts', TIMESTAMPTZ '2026-08-18T10:00:00Z')
       ) AS fixture(week, title, starts_at)`,
      [sid, created!.id]
    );
    return Response.json({
      book: await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [
        created!.id,
      ]),
      ragConfigured: true,
      message: "Standalone upload validated; deterministic course fixture selected.",
    });
  }

  if (!RAG_MCP_URL) {
    return Response.json(
      { error: "RAG_MCP_URL is not set — the book cannot be indexed, so a course cannot be built." },
      { status: 503 }
    );
  }

  // Replacing? This student's old book must leave THEIR RAG namespace first, or
  // the lecturer would keep answering from it. A clear that fails aborts loudly.
  // The user_id (sid) scopes the clear to this student's namespace only.
  const existing = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM books WHERE student_id = $1",
    [sid]
  );
  if (Number(existing?.count ?? 0) > 0) {
    const cleared = await runPython("services/rag-tools/rag_admin.py", ["clear", sid]);
    const clearedPayload = parseJsonLine<{ ok: boolean; removed?: number; error?: string }>(
      cleared.stdout
    );
    if (!clearedPayload?.ok) {
      return Response.json(
        {
          error: "Could not prepare the new course.",
          detail: clearedPayload?.error ?? cleared.stderr.trim().split("\n").slice(-2).join(" "),
        },
        { status: 502 }
      );
    }
  }
  await resetCourse(sid);

  // Per-student uploads dir so two students' identically-named files never clash.
  const uploadsDir = path.join(REPO_ROOT, "uploads", sid);
  await fs.mkdir(uploadsDir, { recursive: true });
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const destination = path.join(uploadsDir, safeName);
  await fs.writeFile(destination, bytes);

  const uploadedAt = await now();
  const created = await queryOne<{ id: number }>(
    `INSERT INTO books (student_id, filename, status, uploaded_at, progress)
     VALUES ($1, $2, 'ingesting', $3, 'Preparing your book…') RETURNING id`,
    [sid, safeName, uploadedAt]
  );
  const bookId = created!.id;

  // A full textbook takes the RAG service a while to chunk and embed on this
  // machine — a 600-page book measured ~29 minutes. The MCP client must stay
  // connected the whole time: their server aborts the ingest on disconnect.
  const result = await runPython("services/rag-tools/rag_ingest.py", [destination, sid], 60 * 60_000);
  const payload = parseJsonLine<{ ok: boolean; message?: string; error?: string }>(result.stdout);

  if (!payload?.ok) {
    const detail = payload?.error ?? result.stderr.trim().split("\n").slice(-2).join(" ");
    await query(
      "UPDATE books SET status = 'failed', error = $1, progress = NULL WHERE id = $2",
      [detail, bookId]
    );
    return Response.json(
      { error: "Could not prepare this book.", detail },
      { status: 502 }
    );
  }

  await query(
    `UPDATE books SET status = 'generating', title = $1,
        progress = 'Preparing your four-week course…' WHERE id = $2`,
    [safeName, bookId]
  );
  spawnGeneration(destination, bookId);

  return Response.json({
    book: await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [bookId]),
    ragConfigured: true,
    message: payload.message,
  });
}
