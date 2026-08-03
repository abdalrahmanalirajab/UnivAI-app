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
};

export type CollectionResult =
  | { ok: true; collection: Collection }
  | { ok: false; error: string };

export type DocumentResult =
  | { ok: true; document: Document }
  | { ok: false; error: string };

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

export async function listCollections(studentId: string): Promise<Collection[]> {
  return query<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE student_id = $1 ORDER BY created_at DESC`,
    [studentId],
  );
}

export const DEFAULT_COLLECTION_NAME = "My Library";

export async function getOrCreateCollection(
  studentId: string,
): Promise<CollectionResult> {
  const existing = await queryOne<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections
     WHERE student_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
    [studentId],
  );
  if (existing) return { ok: true, collection: existing };

  const result = await createCollection(studentId, DEFAULT_COLLECTION_NAME);
  if (!result.ok) return result;

  const canonical = await queryOne<Collection>(
    `SELECT ${COLLECTION_COLUMNS} FROM collections
     WHERE student_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
    [studentId],
  );
  return { ok: true, collection: canonical ?? result.collection };
}

export async function addDocument(
  collectionId: number,
  studentId: string,
  filename: string,
): Promise<DocumentResult> {
  const nameMsg = validateFilename(filename);
  if (nameMsg) return { ok: false, error: nameMsg };

  const doc = await queryOne<Document>(
    `INSERT INTO documents (collection_id, student_id, filename, status)
     VALUES ($1, $2, $3, 'pending') RETURNING ${DOCUMENT_COLUMNS}`,
    [collectionId, studentId, filename],
  );
  return { ok: true, document: doc! };
}

export async function listDocuments(
  collectionId: number,
  studentId: string,
): Promise<Document[]> {
  return query<Document>(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE collection_id = $1 AND student_id = $2 ORDER BY created_at DESC`,
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
