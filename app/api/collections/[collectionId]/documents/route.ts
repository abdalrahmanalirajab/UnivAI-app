import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUserApi } from "@/lib/session";
import { REPO_ROOT } from "@/lib/python";
import {
  addDocument,
  documentStorageKey,
  getDocument,
  getOwnedCollection,
  hasApprovedPlanReferencingDocument,
  hasInFlightCourseGeneration,
  listDocuments,
  removeDocument,
  removeDocumentAndBook,
  validateFilename,
} from "@/lib/collections";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

function parseCollectionId(params: { collectionId: string }): number | null {
  const id = Number(params.collectionId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { collectionId: raw } = await params;
  const collectionId = parseCollectionId({ collectionId: raw });
  if (!collectionId) {
    return Response.json({ error: "Invalid collection ID." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.studentId);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const documents = await listDocuments(collectionId, gate.studentId);
  return Response.json({ documents });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { collectionId: raw } = await params;
  const collectionId = parseCollectionId({ collectionId: raw });
  if (!collectionId) {
    return Response.json({ error: "Invalid collection ID." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.studentId);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");

  const validationMsg = validateFilename(safeName);
  if (validationMsg) {
    return Response.json({ error: validationMsg }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 60 MB.` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
    return Response.json(
      { error: "That file is not a real PDF — its contents do not start with %PDF-." },
      { status: 400 },
    );
  }

  const result = await addDocument(collectionId, gate.studentId, safeName);
  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        code: result.code,
        document: result.document,
      },
      { status: result.code === "DOCUMENT_ALREADY_ACTIVE" ? 409 : 500 },
    );
  }

  const uploadsDir = path.join(
    REPO_ROOT,
    "uploads",
    gate.studentId,
    "collections",
    String(collectionId),
    String(result.document.id),
  );
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, safeName), bytes);
  } catch {
    await removeDocument(result.document.id, gate.studentId);
    await fs.rm(uploadsDir, { recursive: true, force: true }).catch(() => {});
    return Response.json({ error: "Could not store the uploaded PDF." }, { status: 500 });
  }

  return Response.json({ document: result.document }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { collectionId: raw } = await params;
  const collectionId = parseCollectionId({ collectionId: raw });
  if (!collectionId) {
    return Response.json({ error: "Invalid collection ID." }, { status: 400 });
  }

  const ownership = await getOwnedCollection(collectionId, gate.studentId);
  if (!ownership.owned) {
    return Response.json(
      { error: ownership.exists ? "You do not have access to this collection." : "Collection not found." },
      { status: ownership.exists ? 403 : 404 },
    );
  }

  const documentId = Number(request.nextUrl.searchParams.get("documentId"));
  if (!Number.isInteger(documentId) || documentId < 1) {
    return Response.json({ error: "Invalid document ID." }, { status: 400 });
  }

  const doc = await getDocument(documentId, gate.studentId);
  if (!doc || doc.collection_id !== collectionId) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const planReferenced = await hasApprovedPlanReferencingDocument(
    gate.studentId,
    documentId,
    collectionId,
  );
  if (planReferenced) {
    return Response.json(
      { error: "This source is part of your approved plan and cannot be removed." },
      { status: 409 },
    );
  }

  const generationInFlight = await hasInFlightCourseGeneration(gate.studentId);
  if (generationInFlight) {
    return Response.json(
      { error: "A course is still being generated. Wait for it to finish before removing sources." },
      { status: 409 },
    );
  }

  const docDir = path.join(
    REPO_ROOT,
    "uploads",
    gate.studentId,
    "collections",
    String(collectionId),
    String(documentId),
  );

  try {
    await fs.rm(docDir, { recursive: true, force: true });
  } catch {
    return Response.json({ error: "Could not remove the stored source." }, { status: 500 });
  }

  const removed = await removeDocumentAndBook(
    documentId,
    gate.studentId,
    documentStorageKey(collectionId, documentId, doc.filename),
  );
  if (!removed.ok) {
    return Response.json({ error: removed.error }, { status: 404 });
  }

  return Response.json({ removed: true });
}
