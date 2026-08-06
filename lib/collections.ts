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
  studentId: string,
  name: string,
): Promise<CollectionResult> {
  const nameMsg = validateCollectionName(name);
  if (nameMsg) return { ok: false, error: nameMsg };

  const collection = await queryOne<Collection>(
    `INSERT INTO collections (student_id, name) VALUES ($1, $2) RETURNING ${COLLECTION_COLUMNS}`,
    [studentId, name.trim()],
  );
  return { ok: true, collection: collection! };
}

export async function getCollection(
  collectionId: number,
  studentId: string,
): Promise<Collection | null> {
  return queryOne<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE id = $1 AND student_id = $2`,
    [collectionId, studentId],
  );
}

export type CollectionOwnership =
  | { owned: true; collection: Collection }
  | { owned: false; exists: boolean };

export async function getOwnedCollection(
  collectionId: number,
  studentId: string,
): Promise<CollectionOwnership> {
  const owned = await getCollection(collectionId, studentId);
  if (owned) return { owned: true, collection: owned };
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM collections WHERE id = $1",
    [collectionId],
  );
  return { owned: false, exists: Boolean(exists) };
}

export async function hasApprovedPlanReferencingDocument(
  studentId: string,
  documentId: number,
  collectionId: number,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM programmes
     WHERE student_id = $1 AND status = 'approved' AND collection_id = $2
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(plan->'source_coverage') AS s
         WHERE (s->>'document_id')::int = $3
       )
     LIMIT 1`,
    [studentId, collectionId, documentId],
  );
  return Boolean(row);
}

export async function hasInFlightCourseGeneration(
  studentId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM books
     WHERE student_id = $1 AND status IN ('ingesting', 'generating')
     LIMIT 1`,
    [studentId],
  );
  return Boolean(row);
}

export async function listCollections(studentId: string): Promise<Collection[]> {
  return query<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE student_id = $1 ORDER BY created_at DESC`,
    [studentId],
  );
}

export const DEFAULT_COLLECTION_NAME = "My Library";

export async function getOrCreateCollection(
  studentId: string,
  name = DEFAULT_COLLECTION_NAME,
): Promise<GetOrCreateCollectionResult> {
  const nameMsg = validateCollectionName(name);
  if (nameMsg) return { ok: false, error: nameMsg };

  // The transaction-scoped advisory lock makes the read/insert one atomic
  // operation even when two tabs create the learner's first collection at
  // the same time. No client-provided name or collection ID is trusted as an
  // ownership boundary; studentId always comes from the authenticated session.
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
    [studentId, name.trim()],
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

export async function addDocument(
  collectionId: number,
  studentId: string,
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
     ), existing AS (
       SELECT ${DOCUMENT_COLUMNS}
       FROM documents, lock
       WHERE collection_id = $1 AND student_id = $2 AND filename = $3
         AND status IN ('pending', 'uploading')
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
    [collectionId, studentId, filename],
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

export async function listDocuments(
  collectionId: number,
  studentId: string,
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
         ORDER BY b.id DESC LIMIT 1) AS generation_error
     FROM documents WHERE collection_id = $1 AND student_id = $2 ORDER BY created_at DESC`,
    [collectionId, studentId],
  );
}

export async function getDocument(
  documentId: number,
  studentId: string,
): Promise<Document | null> {
  return queryOne<Document>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = $1 AND student_id = $2`,
    [documentId, studentId],
  );
}

export async function updateDocumentStatus(
  documentId: number,
  studentId: string,
  status: DocumentStatus,
  error?: string,
): Promise<DocumentResult> {
  const statusMsg = validateDocumentStatus(status);
  if (statusMsg) return { ok: false, error: statusMsg };

  const doc = await queryOne<Document>(
    `UPDATE documents SET status = $1, error = $2, updated_at = NOW()
     WHERE id = $3 AND student_id = $4
     RETURNING ${DOCUMENT_COLUMNS}`,
    [status, error ?? null, documentId, studentId],
  );
  if (!doc) return { ok: false, error: "Document not found." };
  return { ok: true, document: doc };
}

export async function claimDocumentUpload(
  documentId: number,
  studentId: string,
): Promise<Document | null> {
  return queryOne<Document>(
    `UPDATE documents SET status = 'uploading', error = NULL, updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status IN ('pending', 'failed')
     RETURNING ${DOCUMENT_COLUMNS}`,
    [documentId, studentId],
  );
}

export async function removeDocument(
  documentId: number,
  studentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await query(
    "DELETE FROM documents WHERE id = $1 AND student_id = $2 RETURNING id",
    [documentId, studentId],
  );
  if (result.length === 0) return { ok: false, error: "Document not found." };
  return { ok: true };
}

export async function removeDocumentAndBook(
  documentId: number,
  studentId: string,
  storageKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await queryOne<{ id: number }>(
    `WITH deleted_books AS (
       DELETE FROM books WHERE student_id = $1 AND filename = $2 RETURNING id
     ), deleted_document AS (
       DELETE FROM documents WHERE id = $3 AND student_id = $1 RETURNING id
     )
     SELECT id FROM deleted_document`,
    [studentId, storageKey, documentId],
  );
  if (!row) return { ok: false, error: "Document not found." };
  return { ok: true };
}

export async function retryDocument(
  documentId: number,
  studentId: string,
): Promise<DocumentResult> {
  const doc = await queryOne<Document>(
    `UPDATE documents SET status = 'pending', error = NULL, updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status = 'failed'
     RETURNING ${DOCUMENT_COLUMNS}`,
    [documentId, studentId],
  );
  if (!doc) return { ok: false, error: "Document not found or not in failed state." };
  return { ok: true, document: doc };
}
