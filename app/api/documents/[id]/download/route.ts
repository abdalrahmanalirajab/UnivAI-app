import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { documentStorageKey, getDocument, type Document } from "@/lib/collections";
import { REPO_ROOT } from "@/lib/python";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isInside(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveOwnedPdf(
  registrationNumber: string,
  document: Document,
): Promise<{ filename: string; path: string; size: number } | null> {
  if (
    document.filename !== path.basename(document.filename) ||
    document.filename.includes("\\") ||
    !document.filename.toLowerCase().endsWith(".pdf")
  ) {
    return null;
  }
  const uploadsRoot = path.resolve(REPO_ROOT, "uploads");
  const ownerRoot = path.resolve(uploadsRoot, registrationNumber);
  if (!isInside(uploadsRoot, ownerRoot)) return null;

  const storageKey = documentStorageKey(
    document.collection_id,
    document.id,
    document.filename,
  );
  const candidate = path.resolve(ownerRoot, ...storageKey.split("/"));
  if (!isInside(ownerRoot, candidate)) return null;

  try {
    const [realUploadsRoot, realOwnerRoot, realCandidate] = await Promise.all([
      realpath(uploadsRoot),
      realpath(ownerRoot),
      realpath(candidate),
    ]);
    if (
      !isInside(realUploadsRoot, realOwnerRoot) ||
      !isInside(realOwnerRoot, realCandidate)
    ) {
      return null;
    }

    const info = await stat(realCandidate);
    if (!info.isFile() || info.size < 5) return null;

    const handle = await open(realCandidate, "r");
    try {
      const magic = Buffer.alloc(5);
      await handle.read(magic, 0, magic.length, 0);
      if (magic.toString("latin1") !== "%PDF-") return null;
    } finally {
      await handle.close();
    }

    return { filename: document.filename, path: realCandidate, size: info.size };
  } catch {
    return null;
  }
}

type ByteRange = { start: number; end: number };

function parseRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function encodedFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function serve(
  request: Request,
  context: { params: Promise<{ id: string }> },
  headOnly: boolean,
): Promise<Response> {
  const gate = await requireUserApi();
  if (gate instanceof Response) return gate;

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return new Response("Not found", { status: 404 });
  const documentId = Number(id);
  if (!Number.isSafeInteger(documentId)) return new Response("Not found", { status: 404 });

  const document = await getDocument(documentId, gate.registrationNumber);
  if (!document) return new Response("Not found", { status: 404 });
  if (document.status !== "ready") {
    return Response.json(
      { error: "This PDF is still being prepared." },
      { status: 409 },
    );
  }

  const pdf = await resolveOwnedPdf(gate.registrationNumber, document);
  if (!pdf) return new Response("PDF not found", { status: 404 });

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, pdf.size) : null;
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${pdf.size}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? pdf.size - 1;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename(pdf.filename)}`,
    "Content-Length": String(end - start + 1),
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${pdf.size}`);

  const body = headOnly
    ? null
    : (Readable.toWeb(createReadStream(pdf.path, { start, end })) as unknown as BodyInit);
  return new Response(body, { status: range ? 206 : 200, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return serve(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return serve(request, context, true);
}
