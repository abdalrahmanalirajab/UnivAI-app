import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUserApi } from "@/lib/session";
import { REPO_ROOT } from "@/lib/python";
import { getCollection } from "@/lib/collections";
import {
  addDocument,
  getDocument,
  listDocuments,
  removeDocument,
} from "@/lib/collections";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

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
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 60 MB.` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== PDF_MAGIC) {
    return Response.json(
      { error: "That file is not a real PDF — its contents do not start with %PDF-." },
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
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const destination = path.join(uploadsDir, safeName);
  await fs.writeFile(destination, bytes);

  const document = await addDocument(collectionId, gate.studentId, safeName);
  return Response.json({ document }, { status: 201 });
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
  await fs.rm(docPath).catch(() => {});
  await removeDocument(documentId, gate.studentId);

  return Response.json({ removed: true });
}
