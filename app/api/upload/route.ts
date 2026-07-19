import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { now } from "@/lib/clock";
import { runPython, parseJsonLine, REPO_ROOT } from "@/lib/python";
import { resetExamWorld } from "@/lib/exams";
import { spawnGeneration } from "@/lib/generation";
import { env } from "@/lib/env";

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
  const books = await query<Book & { uploaded_at: string }>(
    `SELECT ${BOOK_COLUMNS}, uploaded_at FROM books ORDER BY id DESC`
  );
  return Response.json({
    books,
    book: books[0] ?? null,
    ragConfigured: Boolean(RAG_MCP_URL),
  });
}

/** Everything the old course was: gone. A new book means a new semester. */
async function resetCourse(): Promise<void> {
  await query("DELETE FROM grades");
  await query("DELETE FROM attendance");
  await query("DELETE FROM qa_log");
  await query("DELETE FROM lectures");
  await query("DELETE FROM books");
  await resetExamWorld();
}

export async function POST(request: NextRequest) {
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

  if (!RAG_MCP_URL) {
    return Response.json(
      { error: "RAG_MCP_URL is not set — the book cannot be indexed, so a course cannot be built." },
      { status: 503 }
    );
  }

  // Replacing? The old book must leave the RAG first, or the lecturer would
  // keep answering from it. A clear that fails aborts the upload — loudly.
  const existing = await queryOne<{ count: string }>("SELECT COUNT(*)::text AS count FROM books");
  if (Number(existing?.count ?? 0) > 0) {
    const cleared = await runPython("services/rag-tools/rag_admin.py", ["clear"]);
    const clearedPayload = parseJsonLine<{ ok: boolean; removed?: number; error?: string }>(
      cleared.stdout
    );
    if (!clearedPayload?.ok) {
      return Response.json(
        {
          error: "Could not clear the previous book out of the RAG service.",
          detail: clearedPayload?.error ?? cleared.stderr.trim().split("\n").slice(-2).join(" "),
        },
        { status: 502 }
      );
    }
  }
  await resetCourse();

  const uploadsDir = path.join(REPO_ROOT, "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const destination = path.join(uploadsDir, safeName);
  await fs.writeFile(destination, bytes);

  const uploadedAt = await now();
  const created = await queryOne<{ id: number }>(
    `INSERT INTO books (filename, status, uploaded_at, progress)
     VALUES ($1, 'ingesting', $2, 'Indexing the book in the RAG service…') RETURNING id`,
    [safeName, uploadedAt]
  );
  const bookId = created!.id;

  // A full textbook takes the RAG service a while to chunk and embed on this
  // machine — a 600-page book measured ~29 minutes. The MCP client must stay
  // connected the whole time: their server aborts the ingest on disconnect.
  const result = await runPython("services/rag-tools/rag_ingest.py", [destination], 60 * 60_000);
  const payload = parseJsonLine<{ ok: boolean; message?: string; error?: string }>(result.stdout);

  if (!payload?.ok) {
    const detail = payload?.error ?? result.stderr.trim().split("\n").slice(-2).join(" ");
    await query(
      "UPDATE books SET status = 'failed', error = $1, progress = NULL WHERE id = $2",
      [detail, bookId]
    );
    return Response.json(
      { error: "The RAG service could not index this book.", detail },
      { status: 502 }
    );
  }

  await query(
    `UPDATE books SET status = 'generating', title = $1,
        progress = 'Indexed. Generating the 4-week course from the book…' WHERE id = $2`,
    [safeName, bookId]
  );
  spawnGeneration(destination, bookId);

  return Response.json({
    book: await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [bookId]),
    ragConfigured: true,
    message: payload.message,
  });
}
