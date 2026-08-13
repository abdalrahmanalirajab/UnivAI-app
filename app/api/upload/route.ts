import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { query, queryOne } from "@/lib/db";
import { now } from "@/lib/clock";
import { runPython, parseJsonLine, REPO_ROOT } from "@/lib/python";
import {
  addDocument,
  claimDocumentUpload,
  documentStorageKey,
  findDocumentByContent,
  getDocument,
  getOrCreateCollection,
  getOwnedCollection,
  removeDocumentAndBook,
  setDocumentContentHash,
  updateDocumentStatus,
  type Document,
} from "@/lib/collections";
import { spawnGeneration } from "@/lib/generation";
import { getProgrammeForCollection } from "@/lib/programmes";
import { requireUserApi, requireVerifiedUserApi } from "@/lib/session";
import { env } from "@/lib/env";
import { isStandalone } from "@/lib/runtime";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { CURRENT_EULA_VERSION } from "@/lib/legal-documents";
import {
  recordUploadEulaAcceptance,
  validUploadAttestation,
} from "@/lib/legal";

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
  generation_stage: string | null;
  generation_total_weeks: number;
  generation_ready_weeks: number;
  generation_audio_ready_weeks: number;
  heartbeat_at: string | null;
};

const BOOK_COLUMNS = `id, filename, title, pages, status, error, progress,
  generation_stage, generation_total_weeks, generation_ready_weeks,
  generation_audio_ready_weeks, heartbeat_at`;

function positiveFormId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readFormString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uploadPath(registrationNumber: string, storageKey: string): string {
  return path.join(REPO_ROOT, "uploads", registrationNumber, ...storageKey.split("/"));
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
    [gate.registrationNumber]
  );
  return Response.json({
    books: books.map((book) => publicBook(book)),
    book: publicBook(books[0] ?? null),
    ragConfigured: isStandalone() || Boolean(RAG_MCP_URL),
  });
}

/** Where a claimed document is parked, so the wrapper below can release it. */
type UploadClaim = { current: { documentId: number; registrationNumber: string } | null };

export async function POST(request: NextRequest) {
  // Claiming a document parks it in 'uploading', and only this request moves it
  // on. Every *expected* failure below sets a terminal status, but an
  // unexpected throw — a bad query, a helper that blows up — used to escape
  // with the claim still held. Nothing expires an in-flight upload, so that
  // book became permanently un-uploadable: every retry answered "This book is
  // already being uploaded for this account." Fail the claim explicitly, then
  // rethrow so the error still surfaces as a 500 and in the log.
  const claim: UploadClaim = { current: null };
  try {
    return await runUpload(request, claim);
  } catch (error) {
    if (claim.current) {
      await updateDocumentStatus(
        claim.current.documentId,
        claim.current.registrationNumber,
        "failed",
        "The upload stopped unexpectedly. Try again.",
      ).catch(() => {});
    }
    throw error;
  }
}

async function runUpload(request: NextRequest, claim: UploadClaim) {
  // Authorization must run before multipart parsing or any upload side effect.
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "upload");
  if (limited) return limited;
  const sid = gate.registrationNumber;

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

  if (file && form && !validUploadAttestation(form)) {
    return Response.json(
      {
        error: "Accept the current EULA and confirm you are authorized to use this material.",
        code: "EULA_ACCEPTANCE_REQUIRED",
        eulaVersion: CURRENT_EULA_VERSION,
      },
      { status: 422 },
    );
  }
  if (file) {
    await recordUploadEulaAcceptance({
      userId: gate.id,
      registrationNumber: sid,
      locale: gate.uiLocale,
      headers: request.headers,
    });
  }

  const standalone = isStandalone();
  if (!standalone && !RAG_MCP_URL) {
    return Response.json(
      { error: "RAG_MCP_URL is not set — the book cannot be indexed, so a course cannot be built." },
      { status: 503 }
    );
  }

  let safeName = file?.name.replace(/[^\w.\-]+/g, "_") ?? "";

  // The byte identity of this book, computed HERE from the bytes we actually
  // received. The client sends its own hash so the picker can react before the
  // upload finishes, but only this value is ever stored or matched against —
  // a trusted client hash would let anyone name someone else's book and be
  // handed it.
  let contentSha256 = bytes ? sha256Hex(bytes) : null;
  const clientSha256 = readFormString(form?.get("clientSha256") ?? null);
  if (contentSha256 && clientSha256 && clientSha256 !== contentSha256) {
    // Not fatal — a proxy may have re-encoded, or the file changed on disk
    // between picking and sending. The server's answer simply wins.
    console.warn(
      `[upload] client hash disagreed with the received bytes for ${safeName}; using the server hash`,
    );
  }

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

    // Same bytes, any filename: this learner already has this book. Renaming a
    // PDF used to buy a whole second course built from identical material.
    if (contentSha256) {
      const twin = await findDocumentByContent(sid, contentSha256);
      if (twin && twin.id !== requestedDocumentId) {
        return Response.json(
          {
            error: `Same as "${twin.filename}" — you have already uploaded this book.`,
            code: "DUPLICATE_BOOK",
            documentId: twin.id,
            collectionId: twin.collection_id,
            duplicateOf: { documentId: twin.id, filename: twin.filename },
          },
          { status: 409 },
        );
      }
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
    // Nothing past the chapter plan may run until the learner has approved the
    // curriculum built from that plan — not the first pass, and not a resume.
    // Resuming is exactly how an unapproved course used to start building: the
    // library offers the button, and clicking it went straight to the
    // lectures.
    if (book && ["awaiting_approval", "failed", "partial_failed", "partial", "generating"].includes(book.status)) {
      const programme = await getProgrammeForCollection(collectionId, sid);
      if (programme?.status !== "approved") {
        return Response.json(
          {
            error: programme
              ? "Approve your curriculum before the course is built."
              : "Build and approve your curriculum before the course is built.",
            code: "CURRICULUM_NOT_APPROVED",
            documentId: document.id,
            collectionId,
            bookId: book.id,
            programmeId: programme?.id ?? null,
          },
          { status: 409 },
        );
      }
    }
    if (book && ["failed", "partial_failed", "partial", "generating"].includes(book.status)) {
      const resumed = await queryOne<Book>(
        `UPDATE books SET status = 'generating', generation_stage = 'resuming',
            error = NULL, progress = 'Checking completed milestones…',
            heartbeat_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND student_id = $2
           AND (
             status IN ('failed', 'partial_failed', 'partial')
             OR (status = 'generating' AND heartbeat_at IS NOT NULL
                 AND heartbeat_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes')
           )
         RETURNING ${BOOK_COLUMNS}`,
        [book.id, sid],
      );
      if (!resumed) {
        return Response.json({
          book: publicBook(book),
          document,
          message: "Course generation is already running. Progress will update automatically.",
          documentId: document.id,
          collectionId,
          bookId: book.id,
        });
      }
      const destination = uploadPath(sid, storageKey);
      try {
        await fs.access(destination);
      } catch {
        await query(
          `UPDATE books SET status = 'partial_failed', generation_stage = 'source',
              error = 'The stored PDF is missing.', progress = 'Resume needs the original PDF.'
           WHERE id = $1`,
          [book.id],
        );
        return Response.json(
          { error: "The stored PDF is missing. Upload the original file again." },
          { status: 409 },
        );
      }
      spawnGeneration(destination, book.id);
      return Response.json({
        book: publicBook(resumed),
        document,
        documentId: document.id,
        collectionId,
        bookId: book.id,
        resumed: true,
        message: "Generation resumed from completed milestones.",
      });
    }
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
  claim.current = { documentId: document.id, registrationNumber: sid };

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

  // A retry sends no file and re-reads the stored PDF, so this is the first
  // point at which the bytes are certain to be in hand either way.
  contentSha256 ??= bytes ? sha256Hex(bytes) : null;
  if (contentSha256) {
    await setDocumentContentHash(document.id, sid, contentSha256);
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
          progress = 'Preparing your book…',
          source_sha256 = COALESCE($3, source_sha256)
       WHERE id = $1 AND student_id = $2`,
      [book.id, sid, contentSha256],
    );
  } else {
    // source_sha256 is set HERE, not left to the generator: it is what lets a
    // later learner's build find this course and adopt it instead of paying
    // for the same book to be written twice.
    const created = await queryOne<{ id: number }>(
      `INSERT INTO books (student_id, filename, status, uploaded_at, progress, source_sha256)
       VALUES ($1, $2, 'ingesting', $3, 'Preparing your book…', $4) RETURNING id`,
      [sid, storageKey, uploadedAt, contentSha256],
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
    request.signal,
  );
  if (request.signal.aborted) {
    await removeDocumentAndBook(document.id, sid, storageKey).catch(() => undefined);
    await fs.rm(path.dirname(destination), { recursive: true, force: true }).catch(() => undefined);
    return Response.json({ error: "Upload cancelled." }, { status: 499 });
  }
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
        progress = 'Finding chapters and planning your course…',
        heartbeat_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [safeName, bookId]
  );
  const readyDocument = await updateDocumentStatus(document.id, sid, "ready");
  // Chapters only, and then stop: the learner approves a curriculum built from
  // that plan, and approval is what spawns the lectures, quizzes, slides and
  // voice. The exception is a book added to a collection already approved —
  // there is nothing left to wait for, so it builds straight through.
  const programme = await getProgrammeForCollection(collectionId, sid);
  const approved = programme?.status === "approved";
  spawnGeneration(destination, bookId, approved ? "full" : "plan");

  return Response.json({
    book: publicBook(await queryOne<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [bookId])),
    document: readyDocument.ok ? readyDocument.document : document,
    documentId: document.id,
    collectionId,
    bookId,
    ragConfigured: true,
    awaitingApproval: !approved,
    message: payload.message,
  });
}
