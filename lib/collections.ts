import { query, queryOne } from "./db";

export type Collection = {
  id: number;
  student_id: string;
  name: string;
  created_at: string;
};

export type DocumentStatus = "pending" | "uploading" | "ready" | "failed";

export type Document = {
  id: number;
  collection_id: number;
  student_id: string;
  filename: string;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  generation_status?: string | null;
  generation_progress?: string | null;
  generation_error?: string | null;
  generation_stage?: string | null;
  generation_total_weeks?: number;
  generation_ready_weeks?: number;
  generation_audio_ready_weeks?: number;
  generation_stalled?: boolean;
  generation_milestones?: Array<{
    week: number;
    stage: string;
    status: string;
    progress: string | null;
    error: string | null;
    attempt_count: number;
  }>;
};

export type CollectionResult =
  | { ok: true; collection: Collection }
  | { ok: false; error: string };

export type GetOrCreateCollectionResult =
  | { ok: true; collection: Collection; created: boolean }
  | { ok: false; error: string };

export type DocumentResult =
  | { ok: true; document: Document }
  | { ok: false; error: string };

export type AddDocumentResult =
  | { ok: true; document: Document }
  | {
      ok: false;
      error: string;
      code: "DOCUMENT_ALREADY_ACTIVE" | "DOCUMENT_CREATE_FAILED";
      document?: Document;
    };

const COLLECTION_COLUMNS = "id, student_id, name, created_at";
const DOCUMENT_COLUMNS =
  "id, collection_id, student_id, filename, status, error, created_at, updated_at";

const VALID_STATUSES: readonly DocumentStatus[] = ["pending", "uploading", "ready", "failed"];

export function validateCollectionName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return "Collection name must be between 2 and 80 characters.";
  return null;
}

export function validateFilename(filename: string): string | null {
  if (filename.length < 1 || filename.length > 255) return "Filename must be between 1 and 255 characters.";
  if (!filename.toLowerCase().endsWith(".pdf")) return "Only PDF files are accepted.";
  return null;
}

export function validateDocumentStatus(status: string): string | null {
  if (!VALID_STATUSES.includes(status as DocumentStatus)) {
    return `Status must be one of: ${VALID_STATUSES.join(", ")}.`;
  }
  return null;
}

export async function createCollection(
  registrationNumber: string,
  name: string,
): Promise<CollectionResult> {
  const nameMsg = validateCollectionName(name);
  if (nameMsg) return { ok: false, error: nameMsg };

  const collection = await queryOne<Collection>(
    `INSERT INTO collections (student_id, name) VALUES ($1, $2) RETURNING ${COLLECTION_COLUMNS}`,
    [registrationNumber, name.trim()],
  );
  return { ok: true, collection: collection! };
}

export async function getCollection(
  collectionId: number,
  registrationNumber: string,
): Promise<Collection | null> {
  return queryOne<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE id = $1 AND student_id = $2`,
    [collectionId, registrationNumber],
  );
}

export type CollectionOwnership =
  | { owned: true; collection: Collection }
  | { owned: false; exists: boolean };

export async function getOwnedCollection(
  collectionId: number,
  registrationNumber: string,
): Promise<CollectionOwnership> {
  const owned = await getCollection(collectionId, registrationNumber);
  if (owned) return { owned: true, collection: owned };
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM collections WHERE id = $1",
    [collectionId],
  );
  return { owned: false, exists: Boolean(exists) };
}

export async function hasInFlightCourseGeneration(
  registrationNumber: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM books
     WHERE student_id = $1 AND status IN ('ingesting', 'generating')
     LIMIT 1`,
    [registrationNumber],
  );
  return Boolean(row);
}

export async function listCollections(registrationNumber: string): Promise<Collection[]> {
  return query<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE student_id = $1 ORDER BY created_at DESC`,
    [registrationNumber],
  );
}

export const DEFAULT_COLLECTION_NAME = "My Library";

export async function getOrCreateCollection(
  registrationNumber: string,
  name = DEFAULT_COLLECTION_NAME,
): Promise<GetOrCreateCollectionResult> {
  const nameMsg = validateCollectionName(name);
  if (nameMsg) return { ok: false, error: nameMsg };

  // The transaction-scoped advisory lock makes the read/insert one atomic
  // operation even when two tabs create the learner's first collection at
  // the same time. No client-provided name or collection ID is trusted as an
  // ownership boundary; registrationNumber always comes from the authenticated session.
  const row = await queryOne<Collection & { created: boolean }>(
    `WITH lock AS (
       SELECT pg_advisory_xact_lock(hashtextextended($1, 0))
     ), existing AS (
       SELECT ${COLLECTION_COLUMNS}
       FROM collections, lock
       WHERE student_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ), inserted AS (
       INSERT INTO collections (student_id, name)
       SELECT $1, $2 FROM lock
       WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING ${COLLECTION_COLUMNS}
     )
     SELECT inserted.*, TRUE AS created FROM inserted
     UNION ALL
     SELECT existing.*, FALSE AS created FROM existing
     LIMIT 1`,
    [registrationNumber, name.trim()],
  );
  if (!row) return { ok: false, error: "Could not create the collection." };
  return { ok: true, collection: row, created: row.created };
}

export function documentStorageKey(
  collectionId: number,
  documentId: number,
  filename: string,
): string {
  return `collections/${collectionId}/${documentId}/${filename}`;
}

/**
 * When an 'uploading' claim is old enough to be certainly abandoned.
 *
 * POST /api/upload releases its own claim on any error it survives, but a
 * process that dies mid-upload (a restart, an OOM kill) cannot, and nothing
 * else expires the claim — that book would stay un-uploadable forever. The
 * window sits just past the ingest timeout the route itself allows (180
 * minutes), so it can never cut short an upload that is still legitimately
 * running: by then the route has already answered and set a terminal status.
 */
const STALE_UPLOAD_HOURS = 4;

export async function addDocument(
  collectionId: number,
  registrationNumber: string,
  filename: string,
): Promise<AddDocumentResult> {
  const nameMsg = validateFilename(filename);
  if (nameMsg) {
    return { ok: false, error: nameMsg, code: "DOCUMENT_CREATE_FAILED" };
  }

  // Serialize only attempts for this learner/collection/filename tuple. Other
  // learners never share this advisory lock and can start their own jobs at
  // once. The existing check and insert are one transaction-scoped operation,
  // so two tabs cannot enqueue duplicate active ingestion work.
  const doc = await queryOne<Document & { created: boolean }>(
    `WITH lock AS (
       SELECT pg_advisory_xact_lock(
         hashtextextended($2::text || ':' || $1::integer::text || ':' || $3::text, 0)
       )
     ), expired AS (
       UPDATE documents SET status = 'failed',
           error = 'The upload stopped before it finished.', updated_at = NOW()
       FROM lock
       WHERE documents.collection_id = $1 AND documents.student_id = $2
         AND documents.filename = $3 AND documents.status = 'uploading'
         AND documents.updated_at < CURRENT_TIMESTAMP - INTERVAL '${STALE_UPLOAD_HOURS} hours'
       RETURNING documents.id
     ), existing AS (
       SELECT ${DOCUMENT_COLUMNS}
       FROM documents, lock
       WHERE collection_id = $1 AND student_id = $2 AND filename = $3
         AND status IN ('pending', 'uploading')
         AND documents.id NOT IN (SELECT id FROM expired)
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     ), inserted AS (
       INSERT INTO documents (collection_id, student_id, filename, status)
       SELECT $1, $2, $3, 'pending' FROM lock
       WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING ${DOCUMENT_COLUMNS}
     )
     SELECT inserted.*, TRUE AS created FROM inserted
     UNION ALL
     SELECT existing.*, FALSE AS created FROM existing
     LIMIT 1`,
    [collectionId, registrationNumber, filename],
  );
  if (!doc) {
    return {
      ok: false,
      error: "Could not attach this book to your library.",
      code: "DOCUMENT_CREATE_FAILED",
    };
  }
  if (!doc.created) {
    return {
      ok: false,
      error: "This book is already being uploaded for this account.",
      code: "DOCUMENT_ALREADY_ACTIVE",
      document: doc,
    };
  }
  return { ok: true, document: doc };
}

/**
 * A book this learner already uploaded, by its bytes rather than its name.
 *
 * The hash must be the server's own (see /api/upload) — matching on a
 * client-supplied value would let a caller point at another learner's
 * document. This query is scoped to one student for the same reason.
 */
export async function findDocumentByContent(
  registrationNumber: string,
  contentSha256: string,
): Promise<Document | null> {
  return queryOne<Document>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents
      WHERE student_id = $1 AND content_sha256 = $2 AND status <> 'failed'
      ORDER BY created_at ASC, id ASC LIMIT 1`,
    [registrationNumber, contentSha256],
  );
}

/** Record the bytes a document turned out to hold, once they are on disk. */
export async function setDocumentContentHash(
  documentId: number,
  registrationNumber: string,
  contentSha256: string,
): Promise<void> {
  await query(
    `UPDATE documents SET content_sha256 = $1, updated_at = NOW()
      WHERE id = $2 AND student_id = $3`,
    [contentSha256, documentId, registrationNumber],
  );
}

export async function listDocuments(
  collectionId: number,
  registrationNumber: string,
): Promise<Document[]> {
  return query<Document>(
    `SELECT ${DOCUMENT_COLUMNS},
       (SELECT b.status FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1) AS generation_status,
       (SELECT b.progress FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1) AS generation_progress,
       (SELECT b.error FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1) AS generation_error,
       (SELECT b.generation_stage FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1) AS generation_stage,
       COALESCE((SELECT b.generation_total_weeks FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1), 0) AS generation_total_weeks,
       COALESCE((SELECT b.generation_ready_weeks FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1), 0) AS generation_ready_weeks,
       COALESCE((SELECT b.generation_audio_ready_weeks FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1), 0) AS generation_audio_ready_weeks,
       COALESCE((SELECT b.status = 'generating'
                         AND b.heartbeat_at IS NOT NULL
                         AND b.heartbeat_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
         FROM books b
         WHERE b.student_id = documents.student_id
           AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
         ORDER BY b.id DESC LIMIT 1), FALSE) AS generation_stalled,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'week', m.week,
           'stage', m.stage,
           'status', m.status,
           'progress', m.progress,
           'error', m.error,
           'attempt_count', m.attempt_count
         ) ORDER BY m.week, m.stage)
         FROM course_generation_milestones m
         WHERE m.book_id = (
           SELECT b.id FROM books b
           WHERE b.student_id = documents.student_id
             AND b.filename = 'collections/' || documents.collection_id || '/' || documents.id || '/' || documents.filename
           ORDER BY b.id DESC LIMIT 1
         )
       ), '[]'::jsonb) AS generation_milestones
     FROM documents WHERE collection_id = $1 AND student_id = $2 ORDER BY created_at DESC`,
    [collectionId, registrationNumber],
  );
}

export async function getDocument(
  documentId: number,
  registrationNumber: string,
): Promise<Document | null> {
  return queryOne<Document>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = $1 AND student_id = $2`,
    [documentId, registrationNumber],
  );
}

export async function updateDocumentStatus(
  documentId: number,
  registrationNumber: string,
  status: DocumentStatus,
  error?: string,
): Promise<DocumentResult> {
  const statusMsg = validateDocumentStatus(status);
  if (statusMsg) return { ok: false, error: statusMsg };

  const doc = await queryOne<Document>(
    `UPDATE documents SET status = $1, error = $2, updated_at = NOW()
     WHERE id = $3 AND student_id = $4
     RETURNING ${DOCUMENT_COLUMNS}`,
    [status, error ?? null, documentId, registrationNumber],
  );
  if (!doc) return { ok: false, error: "Document not found." };
  return { ok: true, document: doc };
}

export async function claimDocumentUpload(
  documentId: number,
  registrationNumber: string,
): Promise<Document | null> {
  return queryOne<Document>(
    `UPDATE documents SET status = 'uploading', error = NULL, updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status IN ('pending', 'failed')
     RETURNING ${DOCUMENT_COLUMNS}`,
    [documentId, registrationNumber],
  );
}

export async function removeDocument(
  documentId: number,
  registrationNumber: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await query(
    "DELETE FROM documents WHERE id = $1 AND student_id = $2 RETURNING id",
    [documentId, registrationNumber],
  );
  if (result.length === 0) return { ok: false, error: "Document not found." };
  return { ok: true };
}

export async function removeDocumentAndBook(
  documentId: number,
  registrationNumber: string,
  storageKey: string,
): Promise<{ ok: true; curriculumInvalidated: boolean } | { ok: false; error: string }> {
  const row = await queryOne<{ id: number; curriculum_invalidated: boolean }>(
    `WITH referenced_programmes AS MATERIALIZED (
       SELECT id FROM programmes
       WHERE student_id = $1
         AND collection_id = (SELECT collection_id FROM documents WHERE id = $3 AND student_id = $1)
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(plan->'source_coverage', '[]'::jsonb)) AS source
           WHERE (source->>'document_id')::int = $3
         )
     ), deleted_section_packs AS (
       DELETE FROM section_packs
       WHERE tenant_id = $1
         AND programme_id IN (SELECT id::text FROM referenced_programmes)
       RETURNING section_pack_id
     ), deleted_programmes AS (
       DELETE FROM programmes WHERE id IN (SELECT id FROM referenced_programmes)
       RETURNING id
     ), deleted_books AS (
       DELETE FROM books WHERE student_id = $1 AND filename = $2 RETURNING id
     ), deleted_document AS (
       DELETE FROM documents WHERE id = $3 AND student_id = $1 RETURNING id
     )
     SELECT id,
            EXISTS (SELECT 1 FROM deleted_programmes) AS curriculum_invalidated
       FROM deleted_document`,
    [registrationNumber, storageKey, documentId],
  );
  if (!row) return { ok: false, error: "Document not found." };
  return { ok: true, curriculumInvalidated: row.curriculum_invalidated };
}

export async function retryDocument(
  documentId: number,
  registrationNumber: string,
): Promise<DocumentResult> {
  const doc = await queryOne<Document>(
    `UPDATE documents SET status = 'pending', error = NULL, updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status = 'failed'
     RETURNING ${DOCUMENT_COLUMNS}`,
    [documentId, registrationNumber],
  );
  if (!doc) return { ok: false, error: "Document not found or not in failed state." };
  return { ok: true, document: doc };
}
