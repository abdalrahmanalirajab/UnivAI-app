import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUserApi } from "@/lib/session";
import { REPO_ROOT } from "@/lib/python";
import {
  addDocument,
  getCollection,
  getDocument,
  listDocuments,
  removeDocument,
  validateFilename,
} from "@/lib/collections";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;

function parseCollectionId(params: { collectionId: string }): number | null {
  const id = Number(params.collectionId);
  return Number.isFinite(id) ? id : null;
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

  const collection = await getCollection(collectionId, gate.studentId);
  if (!collection) {
    return Response.json({ error: "Collection not found." }, { status: 404 });
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

  const collection = await getCollection(collectionId, gate.studentId);
  if (!collection) {
    return Response.json({ error: "Collection not found." }, { status: 404 });
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

  const uploadsDir = path.join(
    REPO_ROOT,
    "uploads",
    gate.studentId,
    "collections",
    String(collectionId),
  );
  await fs.mkdir(uploadsDir, { recursive: true });
  const destination = path.join(uploadsDir, safeName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destination, bytes);

  const result = await addDocument(collectionId, gate.studentId, safeName);
  if (!result.ok) {
    await fs.rm(destination).catch(() => {});
    return Response.json({ error: result.error }, { status: 500 });
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

  const documentId = Number(request.nextUrl.searchParams.get("documentId"));
  if (!Number.isFinite(documentId)) {
    return Response.json({ error: "Invalid document ID." }, { status: 400 });
  }

  const doc = await getDocument(documentId, gate.studentId);
  if (!doc) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const docPath = path.join(
    REPO_ROOT,
    "uploads",
    gate.studentId,
    "collections",
    String(collectionId),
    doc.filename,
  );

  await removeDocument(documentId, gate.studentId);

  await fs.rm(docPath).catch(() => {});

  return Response.json({ removed: true });
}
