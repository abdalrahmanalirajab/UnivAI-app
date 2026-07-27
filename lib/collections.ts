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

const COLLECTION_COLUMNS = "id, student_id, name, created_at";
const DOCUMENT_COLUMNS =
  "id, collection_id, student_id, filename, status, error, created_at, updated_at";

export async function createCollection(
  studentId: string,
  name: string,
): Promise<Collection> {
  const created = await queryOne<Collection>(
    `INSERT INTO collections (student_id, name) VALUES ($1, $2) RETURNING ${COLLECTION_COLUMNS}`,
    [studentId, name],
  );
  return created!;
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

export async function addDocument(
  collectionId: number,
  studentId: string,
  filename: string,
): Promise<Document> {
  const created = await queryOne<Document>(
    `INSERT INTO documents (collection_id, student_id, filename, status)
     VALUES ($1, $2, $3, 'pending') RETURNING ${DOCUMENT_COLUMNS}`,
    [collectionId, studentId, filename],
  );
  return created!;
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
  status: DocumentStatus,
  error?: string,
): Promise<void> {
  await query(
    "UPDATE documents SET status = $1, error = $2, updated_at = NOW() WHERE id = $3",
    [status, error ?? null, documentId],
  );
}

export async function removeDocument(
  documentId: number,
  studentId: string,
): Promise<void> {
  await query("DELETE FROM documents WHERE id = $1 AND student_id = $2", [
    documentId,
    studentId,
  ]);
}

export async function retryDocument(
  documentId: number,
  studentId: string,
): Promise<Document | null> {
  const doc = await queryOne<Document>(
    `UPDATE documents SET status = 'pending', error = NULL, updated_at = NOW()
     WHERE id = $1 AND student_id = $2 AND status = 'failed'
     RETURNING ${DOCUMENT_COLUMNS}`,
    [documentId, studentId],
  );
  return doc ?? null;
}
