import { queryOne } from "./db";
import type { LetterGrade } from "./transcripts";

export type VerifiedCertificate = {
  certificateId: string;
  recipientName: string;
  courseTitle: string;
  letterGrade: LetterGrade;
  totalPercentage: number;
  gpa: number;
  completedAt: string;
  issuedAt: string;
};

export function isCertificateId(value: string): boolean {
  return /^(cert_|cert_demo_)[a-zA-Z0-9_-]{4,80}$/.test(value);
}

/** Public verification exposes only the facts printed on the certificate. */
export async function verifyCertificate(id: string): Promise<VerifiedCertificate | null> {
  if (!isCertificateId(id)) return null;
  const row = await queryOne<{
    certificate_id: string;
    recipient_name: string;
    course_title: string;
    letter_grade: LetterGrade;
    total_percentage: string;
    gpa: string;
    completed_at: Date;
    issued_at: Date;
  }>(
    `SELECT c.id AS certificate_id, u."name" AS recipient_name,
            t.course_title, t.letter_grade, t.total_percentage, t.gpa,
            t.completed_at, c.issued_at
       FROM certificate_artifacts c
       JOIN course_transcripts t ON t.id = c.transcript_id
       JOIN "user" u ON u."studentId" = c.student_id
      WHERE c.id = $1`,
    [id],
  );
  if (!row) return null;
  return {
    certificateId: row.certificate_id,
    recipientName: row.recipient_name,
    courseTitle: row.course_title,
    letterGrade: row.letter_grade,
    totalPercentage: Number(row.total_percentage),
    gpa: Number(row.gpa),
    completedAt: row.completed_at.toISOString(),
    issuedAt: row.issued_at.toISOString(),
  };
}
