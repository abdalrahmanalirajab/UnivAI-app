import { createHash } from "node:crypto";
import path from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { AbsenceCaseError, attachAbsenceEvidence } from "@/lib/absence-cases";
import { enforceUserRateLimit } from "@/lib/rate-limits";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "upload");
  if (limited) return limited;
  const { caseId } = await params;
  if (!UUID.test(caseId)) return Response.json({ error: "Case not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("evidence");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a JPEG or PNG image." }, { status: 400 });
  }
  if (!(["image/jpeg", "image/png"] as const).includes(file.type as "image/jpeg" | "image/png") || file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Evidence must be a JPEG or PNG image no larger than 5 MB." }, { status: 400 });
  }

  let normalized: { bytes: Buffer; originalFilename: string };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const decoded = sharp(input, { failOn: "error", limitInputPixels: 25_000_000 });
    const metadata = await decoded.metadata();
    if (metadata.format !== "jpeg" && metadata.format !== "png") {
      return Response.json({ error: "The uploaded file is not a valid JPEG or PNG image." }, { status: 400 });
    }
    // Re-encoding strips metadata and embedded payloads before protected storage.
    const bytes = await decoded
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "white" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "The normalized image is too large." }, { status: 400 });
    }
    const originalFilename = path.basename(file.name || "evidence.jpg")
      .replace(/[\u0000-\u001f\u007f]/g, "_")
      .slice(0, 180) || "evidence.jpg";
    normalized = { bytes, originalFilename };
  } catch (error) {
    console.error("Could not normalize absence evidence", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "The image could not be validated." }, { status: 400 });
  }

  try {
    const absenceCase = await attachAbsenceEvidence(gate.registrationNumber, caseId, {
      mimeType: "image/jpeg",
      originalFilename: normalized.originalFilename,
      bytes: normalized.bytes,
      sha256: createHash("sha256").update(normalized.bytes).digest("hex"),
    });
    return Response.json({ case: absenceCase });
  } catch (error) {
    if (error instanceof AbsenceCaseError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Could not store absence evidence", error);
    return Response.json({ error: "The evidence could not be stored." }, { status: 500 });
  }
}
