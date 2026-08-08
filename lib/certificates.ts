import { createHash } from "node:crypto";
import path from "node:path";

import sharp from "sharp";

import { query, queryOne } from "./db";
import type { CourseTranscript, LetterGrade } from "./transcripts";

export type CertificateTemplateKey = "d" | "c" | "b" | "a" | "a-star";

const TEMPLATE_FILES: Record<CertificateTemplateKey, string> = {
  d: "certificate-d.png",
  c: "certificate-c.png",
  b: "certificate-b.png",
  a: "certificate-a.png",
  "a-star": "certificate-a-star.png",
};

const INK: Record<CertificateTemplateKey, { main: string; accent: string }> = {
  d: { main: "#4d1c1f", accent: "#9a6b24" },
  c: { main: "#123f49", accent: "#6f7e83" },
  b: { main: "#071d43", accent: "#65798f" },
  a: { main: "#082a68", accent: "#a87917" },
  "a-star": { main: "#07172f", accent: "#9b6a08" },
};

export function templateForGrade(grade: LetterGrade): CertificateTemplateKey {
  if (grade === "A*") return "a-star";
  if (grade.startsWith("A")) return "a";
  if (grade.startsWith("B")) return "b";
  if (grade.startsWith("C")) return "c";
  return "d";
}

export function templatePathForGrade(grade: LetterGrade): string {
  return path.join(
    process.cwd(),
    "public",
    "certificates",
    "templates",
    TEMPLATE_FILES[templateForGrade(grade)],
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function titleLines(title: string): [string, string?] {
  if (title.length <= 54) return [title];
  const words = title.split(/\s+/);
  let first = "";
  while (words.length && `${first} ${words[0]}`.trim().length <= 54) {
    first = `${first} ${words.shift()}`.trim();
  }
  return [first, words.join(" ").slice(0, 70)];
}

export async function renderCertificate(input: {
  recipientName: string;
  studentId: string;
  transcript: CourseTranscript;
  certificateId: string;
  issuedAt: Date;
}): Promise<Buffer> {
  const template = templatePathForGrade(input.transcript.letterGrade);
  const metadata = await sharp(template).metadata();
  const width = metadata.width ?? 1680;
  const height = metadata.height ?? 936;
  const family = templateForGrade(input.transcript.letterGrade);
  const ink = INK[family];
  const scale = width / 1680;
  const headingShift = family === "a-star" ? 130 : 0;
  const identifierY = family === "a-star" ? 790 : 827;
  const verificationBase = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const verificationUrl = `${verificationBase}/verify-certificate/${encodeURIComponent(input.certificateId)}`;
  const [line1, line2] = titleLines(input.transcript.courseTitle);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(input.issuedAt);
  const y = (value: number) => Math.round(value * scale);
  const font = (value: number) => Math.round(value * scale);
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .serif { font-family: Georgia, 'Times New Roman', serif; text-anchor: middle; }
        .sans { font-family: Arial, Helvetica, sans-serif; text-anchor: middle; }
      </style>
      <text x="50%" y="${y(150 + headingShift)}" class="sans" fill="${ink.accent}" font-size="${font(27)}" font-weight="700" letter-spacing="${font(8)}">UNIVAI</text>
      <text x="50%" y="${y(202 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(41)}" font-weight="700">CERTIFICATE OF COURSE COMPLETION</text>
      <text x="50%" y="${y(258 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(22)}" font-style="italic">This certifies that</text>
      <text x="50%" y="${y(337 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(61)}" font-weight="700">${escapeXml(input.recipientName)}</text>
      <line x1="31%" y1="${y(354 + headingShift)}" x2="69%" y2="${y(354 + headingShift)}" stroke="${ink.accent}" stroke-width="${Math.max(1, y(2))}"/>
      <text x="50%" y="${y(405 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(21)}">has successfully completed</text>
      <text x="50%" y="${y(460 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(line2 ? 34 : 39)}" font-weight="700">${escapeXml(line1)}</text>
      ${line2 ? `<text x="50%" y="${y(503 + headingShift)}" class="serif" fill="${ink.main}" font-size="${font(31)}" font-weight="700">${escapeXml(line2)}</text>` : ""}
      <text x="50%" y="${y(566 + headingShift)}" class="sans" fill="${ink.main}" font-size="${font(23)}" font-weight="700">GRADE ${escapeXml(input.transcript.letterGrade)}  •  ${input.transcript.totalPercentage.toFixed(2)}%  •  GPA ${input.transcript.gpa.toFixed(2)} / 4.00</text>
      <text x="34%" y="${y(732)}" class="serif" fill="${ink.main}" font-size="${font(18)}">Issued ${escapeXml(date)}</text>
      <text x="66%" y="${y(732)}" class="serif" fill="${ink.main}" font-size="${font(18)}">Academic Records</text>
      <text x="50%" y="${y(identifierY)}" class="sans" fill="${ink.main}" font-size="${font(12)}" letter-spacing="${font(0.5)}">Verify: ${escapeXml(verificationUrl)}</text>
    </svg>`;

  return sharp(template)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export type CertificateRecord = {
  id: string;
  filename: string;
  templateKey: CertificateTemplateKey;
};

export async function ensureCertificate(input: {
  studentId: string;
  recipientName: string;
  transcript: CourseTranscript;
}): Promise<CertificateRecord> {
  if (!input.transcript.passed) throw new Error("A certificate is not available for an F grade.");
  const id = `cert_${createHash("sha256")
    .update(`${input.studentId}:${input.transcript.id}`)
    .digest("hex")
    .slice(0, 24)}`;
  const existing = await queryOne<{ id: string; filename: string; template_key: CertificateTemplateKey }>(
    `SELECT id, filename, template_key FROM certificate_artifacts
      WHERE transcript_id = $1 AND student_id = $2`,
    [input.transcript.id, input.studentId],
  );
  if (existing) {
    return { id: existing.id, filename: existing.filename, templateKey: existing.template_key };
  }

  const filename = `${input.recipientName.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "student"}-certificate.png`;
  const issuedAt = new Date(input.transcript.completedAt);
  const image = await renderCertificate({
    recipientName: input.recipientName,
    studentId: input.studentId,
    transcript: input.transcript,
    certificateId: id,
    issuedAt,
  });
  const templateKey = templateForGrade(input.transcript.letterGrade);
  await query(
    `INSERT INTO certificate_artifacts
      (id, transcript_id, student_id, template_key, filename, mime_type, image_data, issued_at)
     VALUES ($1,$2,$3,$4,$5,'image/png',$6,$7)
     ON CONFLICT (transcript_id) DO NOTHING`,
    [id, input.transcript.id, input.studentId, templateKey, filename, image, issuedAt],
  );
  const saved = await queryOne<{ id: string; filename: string; template_key: CertificateTemplateKey }>(
    `SELECT id, filename, template_key FROM certificate_artifacts
      WHERE transcript_id = $1 AND student_id = $2`,
    [input.transcript.id, input.studentId],
  );
  if (!saved) throw new Error("Certificate could not be saved.");
  return { id: saved.id, filename: saved.filename, templateKey: saved.template_key };
}
