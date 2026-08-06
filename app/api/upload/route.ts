import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { now } from "@/lib/clock";
import { runPython, parseJsonLine, REPO_ROOT } from "@/lib/python";
import {
  addDocument,
  claimDocumentUpload,
  documentStorageKey,
  getDocument,
  getOrCreateCollection,
  getOwnedCollection,
  updateDocumentStatus,
  type Document,
} from "@/lib/collections";
import { spawnGeneration } from "@/lib/generation";
import { requireUserApi, requireVerifiedUserApi } from "@/lib/session";
import { env } from "@/lib/env";
import { isStandalone } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_BYTES = 60 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

/**
 * Uploading a book adds to the learner's library — it never deletes or
 * resets any existing book or course state:
 *   1. validate and store the new PDF
 *   2. index it — the RAG service's job, reached over MCP
 *   3. attach it to the authenticated user's collection
 *   4. generate the 4 weekly lectures + quizzes from it (lecture_gen.py,
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

function positiveFormId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uploadPath(studentId: string, storageKey: string): string {
  return path.join(REPO_ROOT, "uploads", studentId, ...storageKey.split("/"));
}

function publicBook(book: Book | null): Book | null {
  if (!book) return null;
  const filename = book.filename.split(/[\\/]/).at(-1) ?? book.filename;
  return { ...book, filename };
}

export async function GET() {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const books = await query<Book & { uploaded_at: string }>(
    `SELECT ${BOOK_COLUMNS}, uploaded_at FROM books WHERE student_id = $1 ORDER BY id DESC`,
    [gate.studentId]
  );
  return Response.json({
    books: books.map((book) => publicBook(book)),
    book: publicBook(books[0] ?? null),
    ragConfigured: isStandalone() || Boolean(RAG_MCP_URL),
  });
}

export async function POST(request: NextRequest) {
  // Authorization must run before multipart parsing or any upload side effect.
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const sid = gate.studentId;

  const form = await request.formData().catch(() => null);
  const fileValue = form?.get("file");
  const file = fileValue && typeof fileValue !== "string" ? fileValue : null;
  const requestedDocumentId = positiveFormId(form?.get("documentId") ?? null);
  const requestedCollectionId = positiveFormId(form?.get("collectionId") ?? null);
  const requestedBookId = positiveFormId(form?.get("bookId") ?? null);

  if (!file && !requestedDocumentId) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file && file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 60 MB.` },
      { status: 400 }
    );
  }

  let bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
  if (bytes && bytes.subarray(0, 5).toString("latin1") !== PDF_MAGIC) {
    return Response.json(
      { error: "That file is not a real PDF — its contents do not start with %PDF-." },
      { status: 400 }
    );
  }

  const standalone = isStandalone();
  if (!standalone && !RAG_MCP_URL) {
    return Response.json(
      { error: "RAG_MCP_URL is not set — the book cannot be indexed, so a course cannot be built." },
      { status: 503 }
    );
  }

  let safeName = file?.name.replace(/[^\w.\-]+/g, "_") ?? "";

  let document: Document;
  let collectionId: number;

  if (requestedDocumentId) {
    const existing = await getDocument(requestedDocumentId, sid);
    if (!existing) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }
    if (requestedCollectionId && requestedCollectionId !== existing.collection_id) {
      return Response.json({ error: "Document does not belong to that collection." }, { status: 400 });
    }
    if (file && existing.filename !== safeName) {
      return Response.json({ error: "Retry file does not match the original upload." }, { status: 400 });
    }
    safeName = existing.filename;
    document = existing;
    collectionId = existing.collection_id;
  } else {
    if (requestedCollectionId) {
      const ownership = await getOwnedCollection(requestedCollectionId, sid);
      if (!ownership.owned) {
        return Response.json(
          { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
          { status: ownership.exists ? 403 : 404 },
        );
      }
      collectionId = ownership.collection.id;
    } else {
      const collection = await getOrCreateCollection(sid);
      if (!collection.ok) {
        return Response.json({ error: "Could not prepare your library." }, { status: 502 });
      }
      collectionId = collection.collection.id;
    }

    const attached = await addDocument(collectionId, sid, safeName);
    if (!attached.ok) {
      return Response.json(
        {
          error: attached.error,
          code: attached.code,
          documentId: attached.document?.id,
          collectionId,
        },
        { status: attached.code === "DOCUMENT_ALREADY_ACTIVE" ? 409 : 502 },
      );
    }
    document = attached.document;
  }

  if (document.status === "ready") {
    const storageKey = documentStorageKey(collectionId, document.id, document.filename);
    const book = await queryOne<Book>(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE student_id = $1 AND filename = $2 ORDER BY id DESC LIMIT 1`,
      [sid, storageKey],
    );
    return Response.json({
      book: publicBook(book),
      document,
      documentId: document.id,
      collectionId,
      bookId: book?.id ?? null,
      ragConfigured: standalone || Boolean(RAG_MCP_URL),
      message: "This upload was already completed.",
    });
  }

  const claimed = await claimDocumentUpload(document.id, sid);
  if (!claimed) {
    return Response.json(
      {
        error: "This upload is already being processed.",
        documentId: document.id,
        collectionId,
      },
      { status: 409 },
    );
  }
  document = claimed;

  const storageKey = documentStorageKey(collectionId, document.id, document.filename);
  const destination = uploadPath(sid, storageKey);
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (bytes) {
      await fs.writeFile(destination, bytes);
    } else {
      bytes = await fs.readFile(destination);
    }
  } catch {
    const detail = "Could not store the uploaded PDF.";
    await updateDocumentStatus(document.id, sid, "failed", detail);
    return Response.json(
      { error: detail, documentId: document.id, collectionId },
      { status: 500 },
    );
  }

  const uploadedAt = await now();
  let book = requestedBookId
    ? await queryOne<Book>(
        `SELECT ${BOOK_COLUMNS} FROM books
         WHERE id = $1 AND student_id = $2 AND filename = $3`,
        [requestedBookId, sid, storageKey],
      )
    : null;
  book ??= await queryOne<Book>(
    `SELECT ${BOOK_COLUMNS} FROM books
     WHERE student_id = $1 AND filename = $2 ORDER BY id DESC LIMIT 1`,
    [sid, storageKey],
  );
  if (book) {
    await query(
      `UPDATE books SET status = 'ingesting', error = NULL,
          progress = 'Preparing your book…'
       WHERE id = $1 AND student_id = $2`,
      [book.id, sid],
    );
  } else {
    const created = await queryOne<{ id: number }>(
      `INSERT INTO books (student_id, filename, status, uploaded_at, progress)
       VALUES ($1, $2, 'ingesting', $3, 'Preparing your book…') RETURNING id`,
      [sid, storageKey, uploadedAt],
    );
    book = created
      ? await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1 AND student_id = $2`, [
          created.id,
          sid,
        ])
      : null;
  }
  if (!book) {
    const detail = "Could not create the book record.";
    await updateDocumentStatus(document.id, sid, "failed", detail);
    return Response.json(
      { error: detail, documentId: document.id, collectionId },
      { status: 500 },
    );
  }
  const bookId = book.id;

  if (standalone) {
    await query(
      `UPDATE books SET title = $1, pages = 4, status = 'ready', error = NULL,
          progress = 'Standalone fixture course ready' WHERE id = $2 AND student_id = $3`,
      [safeName, bookId, sid],
    );
    await query(
      `INSERT INTO lectures (student_id, book_id, week, title, starts_at, status)
       SELECT $1, $2, week, title, starts_at, 'ready'
       FROM (VALUES
         (1, 'Evidence and Sources', TIMESTAMPTZ '2026-07-28T10:00:00Z'),
         (2, 'Tenant Isolation', TIMESTAMPTZ '2026-08-04T10:00:00Z'),
         (3, 'Explicit Runtime Modes', TIMESTAMPTZ '2026-08-11T10:00:00Z'),
         (4, 'Stable Contracts', TIMESTAMPTZ '2026-08-18T10:00:00Z')
       ) AS fixture(week, title, starts_at)
       ON CONFLICT (student_id, week) DO NOTHING`,
      [sid, bookId],
    );
    const readyDocument = await updateDocumentStatus(document.id, sid, "ready");
    return Response.json({
      book: publicBook(await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [bookId])),
      document: readyDocument.ok ? readyDocument.document : document,
      documentId: document.id,
      collectionId,
      bookId,
      ragConfigured: true,
      message: "Standalone upload validated; deterministic course fixture selected.",
    });
  }

  // A full textbook takes the RAG service a while to chunk and embed on this
  // machine — a 600-page book measured ~29 minutes. The MCP client must stay
  // connected the whole time: their server aborts the ingest on disconnect.
  const result = await runPython(
    "services/rag-tools/rag_ingest.py",
    [destination, sid, String(collectionId)],
    180 * 60_000,
  );
  const payload = parseJsonLine<{ ok: boolean; message?: string; error?: string }>(result.stdout);

  if (!payload?.ok) {
    const detail = payload?.error ?? result.stderr.trim().split("\n").slice(-2).join(" ");
    await query(
      "UPDATE books SET status = 'failed', error = $1, progress = NULL WHERE id = $2",
      [detail, bookId]
    );
    await updateDocumentStatus(document.id, sid, "failed", detail);
    return Response.json(
      {
        error: "Could not prepare this book.",
        detail,
        documentId: document.id,
        collectionId,
        bookId,
      },
      { status: 502 }
    );
  }

  await query(
    `UPDATE books SET status = 'generating', title = $1,
        progress = 'Finding chapters and planning your course…' WHERE id = $2`,
    [safeName, bookId]
  );
  const readyDocument = await updateDocumentStatus(document.id, sid, "ready");
  spawnGeneration(destination, bookId);

  return Response.json({
    book: publicBook(await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [bookId])),
    document: readyDocument.ok ? readyDocument.document : document,
    documentId: document.id,
    collectionId,
    bookId,
    ragConfigured: true,
    message: payload.message,
  });
}
