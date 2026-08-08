import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

import { renderCertificate, templateForGrade } from "../lib/certificates";
import { scoreCourse, type CourseTranscript } from "../lib/transcripts";

const COURSE_TITLE = "Designing Data-Intensive Applications";
const COMPLETED_AT = new Date("2026-08-08T12:00:00.000Z");

const DEMOS = [
  {
    email: "good@gmail.com",
    name: "Ahmed",
    studentId: "S-2026-990001",
    scores: { quizPercentage: 96, attendancePercentage: 100, midtermPercentage: 95, finalPercentage: 98 },
    preview: "ahmed-a-star-certificate.png",
  },
  {
    email: "good2@gmail.com",
    name: "tolba",
    studentId: "S-2026-990002",
    scores: { quizPercentage: 80, attendancePercentage: 90, midtermPercentage: 78, finalPercentage: 83.5 },
    preview: "tolba-a-minus-certificate.png",
  },
  {
    email: "good3@gmail.com",
    name: "samir",
    studentId: "S-2026-990003",
    scores: { quizPercentage: 75, attendancePercentage: 80, midtermPercentage: 72, finalPercentage: 77.75 },
    preview: "samir-b-certificate.png",
  },
] as const;

function safeDatabaseUrl(): string {
  const value = process.env.DATABASE_URL ?? "postgresql://univai:univai@127.0.0.1:5433/univai";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== "/univai") {
    throw new Error("Refusing to seed outside the local UnivAI database.");
  }
  return value;
}

async function upsertLogin(client: PoolClient, demo: (typeof DEMOS)[number]): Promise<void> {
  const password = await hashPassword(demo.email);
  const userId = `transcript-demo-user-${demo.studentId.slice(-6)}`;
  const accountId = `transcript-demo-account-${demo.studentId.slice(-6)}`;
  const user = await client.query<{ id: string }>(
    `INSERT INTO "user"
      ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role", "studentId")
     VALUES ($1,$2,$3,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'student',$4)
     ON CONFLICT ("email") DO UPDATE SET
       "name" = EXCLUDED."name",
       "emailVerified" = true,
       "updatedAt" = CURRENT_TIMESTAMP,
       "role" = 'student',
       "studentId" = EXCLUDED."studentId"
     RETURNING "id"`,
    [userId, demo.name, demo.email, demo.studentId],
  );
  const credential = await client.query<{ id: string }>(
    `SELECT "id" FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`,
    [user.rows[0].id],
  );
  if (credential.rows[0]) {
    await client.query(
      `UPDATE "account" SET "accountId" = $1, "password" = $2, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3`,
      [demo.email, password, credential.rows[0].id],
    );
  } else {
    await client.query(
      `INSERT INTO "account"
        ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
       VALUES ($1,$2,'credential',$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [accountId, demo.email, user.rows[0].id, password],
    );
  }
  await client.query(
    `INSERT INTO books (filename, title, pages, status, uploaded_at, student_id)
     SELECT 'demo-designing-data-intensive-applications.pdf', $1, 616, 'ready', $2, $3
      WHERE NOT EXISTS (
        SELECT 1 FROM books
         WHERE student_id = $3 AND filename = 'demo-designing-data-intensive-applications.pdf'
      )`,
    [COURSE_TITLE, COMPLETED_AT, demo.studentId],
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: safeDatabaseUrl() });
  const outputDirectory = path.join(process.cwd(), "public", "certificates", "demo");
  await mkdir(outputDirectory, { recursive: true });

  for (const demo of DEMOS) {
    const score = scoreCourse(demo.scores);
    const transcript: CourseTranscript = {
      id: `tr_demo_${demo.studentId.slice(-6)}`,
      courseKey: "demo:designing-data-intensive-applications",
      courseTitle: COURSE_TITLE,
      ...score,
      completedAt: COMPLETED_AT.toISOString(),
      certificateId: null,
    };
    const certificateId = `cert_demo_${demo.studentId.slice(-6)}`;
    const image = await renderCertificate({
      recipientName: demo.name,
      studentId: demo.studentId,
      transcript,
      certificateId,
      issuedAt: COMPLETED_AT,
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await upsertLogin(client, demo);
      await client.query(
        `INSERT INTO course_transcripts
          (id, student_id, course_key, course_title, quiz_percentage, attendance_percentage,
           midterm_percentage, final_percentage, coursework_points, total_percentage,
           letter_grade, gpa, passed, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (student_id, course_key) DO UPDATE SET
           course_title = EXCLUDED.course_title,
           quiz_percentage = EXCLUDED.quiz_percentage,
           attendance_percentage = EXCLUDED.attendance_percentage,
           midterm_percentage = EXCLUDED.midterm_percentage,
           final_percentage = EXCLUDED.final_percentage,
           coursework_points = EXCLUDED.coursework_points,
           total_percentage = EXCLUDED.total_percentage,
           letter_grade = EXCLUDED.letter_grade,
           gpa = EXCLUDED.gpa,
           passed = EXCLUDED.passed,
           completed_at = EXCLUDED.completed_at,
           updated_at = CURRENT_TIMESTAMP`,
        [
          transcript.id,
          demo.studentId,
          transcript.courseKey,
          transcript.courseTitle,
          score.quizPercentage,
          score.attendancePercentage,
          score.midtermPercentage,
          score.finalPercentage,
          score.courseworkPoints,
          score.totalPercentage,
          score.letterGrade,
          score.gpa,
          score.passed,
          COMPLETED_AT,
        ],
      );
      await client.query(
        `INSERT INTO certificate_artifacts
          (id, transcript_id, student_id, template_key, filename, mime_type, image_data, issued_at)
         VALUES ($1,$2,$3,$4,$5,'image/png',$6,$7)
         ON CONFLICT (transcript_id) DO UPDATE SET
           id = EXCLUDED.id,
           template_key = EXCLUDED.template_key,
           filename = EXCLUDED.filename,
           image_data = EXCLUDED.image_data,
           issued_at = EXCLUDED.issued_at`,
        [
          certificateId,
          transcript.id,
          demo.studentId,
          templateForGrade(score.letterGrade),
          demo.preview,
          image,
          COMPLETED_AT,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await writeFile(path.join(outputDirectory, demo.preview), image);
    console.log(`${demo.email} / ${demo.email} -> ${score.letterGrade} (${score.totalPercentage.toFixed(2)}%)`);
  }
  await pool.end();
  console.log(`Certificate previews: ${outputDirectory}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
