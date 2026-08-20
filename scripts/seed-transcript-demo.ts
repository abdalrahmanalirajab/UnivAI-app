import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

import { LEARNER_BANK_SCHEMA_VERSION } from "../lib/assessment-bank-ownership";
import { renderCertificate, templateForGrade } from "../lib/certificates";
import {
  CURRENT_EULA_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from "../lib/legal-documents";
import {
  scoreCourse,
  type CourseTranscript,
  type LetterGrade,
} from "../lib/transcripts";

const COURSE_TITLE = "Database System Concepts — Discussion Demo";
const COURSE_FILENAME = "database-system-concepts-discussion-demo.pdf";
const COURSE_KEY = "demo:database-system-concepts-discussion";
const COLLECTION_NAME = "Discussion Demo Library";
const PROGRAMME_NAME = "Database Systems — Completed Journey";
const ACCOUNT_CREATED_AT = new Date("2025-12-20T09:00:00.000Z");
const BOOK_UPLOADED_AT = new Date("2026-01-02T09:00:00.000Z");
const COMPLETED_AT = new Date("2026-02-02T12:00:00.000Z");

type DemoJourney = {
  email: string;
  name: string;
  registrationNumber: string;
  expectedGrade: LetterGrade;
  attendedWeeks: number;
  scores: {
    quizPercentage: number;
    attendancePercentage: number;
    midtermPercentage: number;
    finalPercentage: number;
  };
  preview: string | null;
  outcome: string;
};

const DEMOS: readonly DemoJourney[] = [
  {
    email: "fail@mailna.co",
    name: "Ahmed Fathi",
    registrationNumber: "S-2026-990001",
    expectedGrade: "F",
    attendedWeeks: 2,
    scores: {
      quizPercentage: 40,
      attendancePercentage: 50,
      midtermPercentage: 35,
      finalPercentage: 38,
    },
    preview: null,
    outcome: "Failed the course; transcript only and no certificate.",
  },
  {
    email: "d@mailna.co",
    name: "Ahmed Samir",
    registrationNumber: "S-2026-990002",
    expectedGrade: "D",
    attendedWeeks: 3,
    scores: {
      quizPercentage: 55,
      attendancePercentage: 75,
      midtermPercentage: 50,
      finalPercentage: 48,
    },
    preview: "ahmed-samir-d-certificate.png",
    outcome: "Passed with the minimum certificate-bearing grade.",
  },
  {
    email: "aplus@mailna.co",
    name: "Abdelrahman Ahmed",
    registrationNumber: "S-2026-990003",
    expectedGrade: "A+",
    attendedWeeks: 4,
    scores: {
      quizPercentage: 92,
      attendancePercentage: 100,
      midtermPercentage: 90,
      finalPercentage: 93,
    },
    preview: "abdelrahman-ahmed-a-plus-certificate.png",
    outcome: "Excellent work across lectures and assessments.",
  },
  {
    email: "astar@mailna.co",
    name: "Abdelrahman Ali",
    registrationNumber: "S-2026-990004",
    expectedGrade: "A*",
    attendedWeeks: 4,
    scores: {
      quizPercentage: 100,
      attendancePercentage: 100,
      midtermPercentage: 98,
      finalPercentage: 99,
    },
    preview: "abdelrahman-ali-a-star-certificate.png",
    outcome: "Top-performing completed journey.",
  },
];

const LECTURES = [
  {
    week: 1,
    title: "Data Models and Database Architecture",
    startsAt: new Date("2026-01-05T10:00:00.000Z"),
    page: 24,
    question: "Why does a DBMS use a data model?",
    answer: "A data model gives the DBMS a precise structure for data, relationships, and constraints.",
  },
  {
    week: 2,
    title: "Relational Algebra and SQL",
    startsAt: new Date("2026-01-12T10:00:00.000Z"),
    page: 86,
    question: "What is the role of relational algebra?",
    answer: "Relational algebra supplies the formal operations behind relational query processing.",
  },
  {
    week: 3,
    title: "Transactions and Concurrency Control",
    startsAt: new Date("2026-01-19T10:00:00.000Z"),
    page: 412,
    question: "What does transaction isolation protect?",
    answer: "Isolation prevents concurrent work from exposing invalid intermediate database states.",
  },
  {
    week: 4,
    title: "Indexing, Recovery, and Distributed Data",
    startsAt: new Date("2026-01-26T10:00:00.000Z"),
    page: 566,
    question: "Why are indexes a trade-off?",
    answer: "Indexes speed reads but require extra storage and maintenance during writes.",
  },
] as const;

const SEMESTER_PLAN = {
  schema_name: "univai.semester.week-plan",
  week_count: LECTURES.length,
  weeks: LECTURES.map((lecture) => ({
    week: lecture.week,
    title: lecture.title,
  })),
};

const PROGRAMME_PLAN = {
  schema_name: "univai.programme.plan",
  schema_version: "1.0.0",
  title: PROGRAMME_NAME,
  workload: { weeks_per_semester: LECTURES.length },
  weeks: LECTURES.map((lecture) => ({
    week: lecture.week,
    title: lecture.title,
  })),
};

function safeDatabaseUrl(): string {
  const value = process.env.DATABASE_URL ?? "postgresql://univai:univai@127.0.0.1:5433/univai";
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.pathname !== "/univai") {
    throw new Error("Refusing to seed outside the local UnivAI database.");
  }
  return value;
}

function stableUuid(family: "lecture" | "artifact", demoIndex: number, week: number): string {
  const prefix = family === "lecture" ? "90000000" : "91000000";
  const suffix = String(demoIndex * 100 + week).padStart(12, "0");
  return `${prefix}-0000-4000-8000-${suffix}`;
}

function transcriptId(demo: DemoJourney): string {
  return `tr_discussion_${demo.registrationNumber.slice(-6)}`;
}

function certificateId(demo: DemoJourney): string {
  return `cert_discussion_${demo.registrationNumber.slice(-6)}`;
}

function sourceHash(demo: DemoJourney): string {
  return createHash("sha256")
    .update(`${demo.registrationNumber}:${COURSE_FILENAME}`)
    .digest("hex");
}

async function upsertLogin(client: PoolClient, demo: DemoJourney): Promise<string> {
  const password = await hashPassword(demo.email);
  const userId = randomUUID();
  const accountId = randomUUID();
  const user = await client.query<{ id: string }>(
    `INSERT INTO "user"
      ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role",
       "registrationNumber", "eulaAccepted", "eulaVersion", "eulaAcceptedAt",
       "privacyNoticeAcknowledged", "privacyNoticeVersion", "privacyNoticeAcknowledgedAt")
     VALUES ($1,$2,$3,true,$4,CURRENT_TIMESTAMP,'student',$5,true,$6,$4,true,$7,$4)
     ON CONFLICT ("registrationNumber") DO UPDATE SET
       "name" = EXCLUDED."name",
       "email" = EXCLUDED."email",
       "emailVerified" = true,
       "updatedAt" = CURRENT_TIMESTAMP,
       "role" = 'student',
       "banned" = false,
       "banReason" = NULL,
       "banExpires" = NULL,
       "eulaAccepted" = true,
       "eulaVersion" = EXCLUDED."eulaVersion",
       "eulaAcceptedAt" = EXCLUDED."eulaAcceptedAt",
       "privacyNoticeAcknowledged" = true,
       "privacyNoticeVersion" = EXCLUDED."privacyNoticeVersion",
       "privacyNoticeAcknowledgedAt" = EXCLUDED."privacyNoticeAcknowledgedAt"
     RETURNING "id"`,
    [
      userId,
      demo.name,
      demo.email,
      ACCOUNT_CREATED_AT,
      demo.registrationNumber,
      CURRENT_EULA_VERSION,
      CURRENT_PRIVACY_NOTICE_VERSION,
    ],
  );
  const savedUserId = user.rows[0].id;
  const credential = await client.query<{ id: string }>(
    `SELECT "id" FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`,
    [savedUserId],
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
       VALUES ($1,$2,'credential',$3,$4,$5,CURRENT_TIMESTAMP)`,
      [accountId, demo.email, savedUserId, password, ACCOUNT_CREATED_AT],
    );
  }
  return savedUserId;
}

async function resetJourney(client: PoolClient, demo: DemoJourney): Promise<void> {
  const sid = demo.registrationNumber;
  await client.query("DELETE FROM certificate_artifacts WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM course_transcripts WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM ai_output_reports WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM ai_output_reactions WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM output_versions WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM qa_log WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM attendance WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM grades WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM lectures WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM lecture_artifacts WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM course_generation_milestones WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM section_packs WHERE tenant_id = $1", [sid]);
  await client.query("DELETE FROM programmes WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM documents WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM collections WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM books WHERE student_id = $1", [sid]);
  await client.query("DELETE FROM settings WHERE key = $1", [`schedule:${sid}:approved-plan`]);
}

async function seedSourceAndProgramme(
  client: PoolClient,
  demo: DemoJourney,
): Promise<{ bookId: number; programmeId: number }> {
  const collection = await client.query<{ id: number }>(
    `INSERT INTO collections (student_id, name, created_at)
     VALUES ($1,$2,$3) RETURNING id`,
    [demo.registrationNumber, COLLECTION_NAME, BOOK_UPLOADED_AT],
  );
  const collectionId = collection.rows[0].id;
  await client.query(
    `INSERT INTO documents
      (collection_id, student_id, filename, status, error, created_at, updated_at)
     VALUES ($1,$2,$3,'ready',NULL,$4,$4)`,
    [collectionId, demo.registrationNumber, COURSE_FILENAME, BOOK_UPLOADED_AT],
  );

  const programme = await client.query<{ id: number }>(
    `INSERT INTO programmes
      (student_id, collection_id, name, status, plan_version, plan, approved_at,
       created_at, updated_at, schedule_timezone, lecture_weekday,
       lecture_local_time, section_weekday, section_local_time,
       schedule_locked_at, first_lecture_at)
     VALUES ($1,$2,$3,'approved',1,$4::jsonb,$5,$6,$6,'Africa/Cairo',1,
             '12:00:00',3,'14:00:00',$5,$7)
     RETURNING id`,
    [
      demo.registrationNumber,
      collectionId,
      PROGRAMME_NAME,
      JSON.stringify(PROGRAMME_PLAN),
      BOOK_UPLOADED_AT,
      ACCOUNT_CREATED_AT,
      LECTURES[0].startsAt,
    ],
  );
  const programmeId = programme.rows[0].id;

  const book = await client.query<{ id: number }>(
    `INSERT INTO books
      (filename, title, pages, status, uploaded_at, progress, student_id,
       source_sha256, generation_stage, generation_total_weeks,
       generation_ready_weeks, generation_audio_ready_weeks, semester_plan,
       generation_manifest)
     VALUES ($1,$2,1376,'ready',$3,'Mock course completed',$4,$5,'complete',4,4,4,
             $6::jsonb,$7::jsonb)
     RETURNING id`,
    [
      COURSE_FILENAME,
      COURSE_TITLE,
      BOOK_UPLOADED_AT,
      demo.registrationNumber,
      sourceHash(demo),
      JSON.stringify(SEMESTER_PLAN),
      JSON.stringify({
        mode: "discussion-demo",
        generated_at: "2026-01-03T12:00:00.000Z",
        weeks: LECTURES.length,
      }),
    ],
  );

  await client.query(
    `INSERT INTO settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [
      `schedule:${demo.registrationNumber}:approved-plan`,
      JSON.stringify({ programmeId, planVersion: 1, weekCount: LECTURES.length }),
    ],
  );
  return { bookId: book.rows[0].id, programmeId };
}

async function seedLectures(
  client: PoolClient,
  demo: DemoJourney,
  demoIndex: number,
  bookId: number,
): Promise<void> {
  for (const lecture of LECTURES) {
    const publicId = stableUuid("lecture", demoIndex, lecture.week);
    const artifactId = stableUuid("artifact", demoIndex, lecture.week);
    const narration = `${lecture.title} is part of the completed discussion-demo course.`;
    const lecturePayload = {
      title: lecture.title,
      intro: narration,
      durationMinutes: 45,
      slides: [
        {
          heading: lecture.title,
          bullets: [lecture.answer],
          page: lecture.page,
          narration: lecture.answer,
        },
      ],
    };
    const scriptPayload = {
      lectureId: publicId,
      title: lecture.title,
      durationMinutes: 45,
      segments: [
        { slide: 1, text: narration, citations: [{ page: lecture.page }] },
        { slide: 2, text: lecture.answer, citations: [{ page: lecture.page }] },
        { slide: 3, text: `Week ${lecture.week} is complete.`, citations: [{ page: lecture.page }] },
      ],
    };
    const slidesPayload = {
      week: lecture.week,
      title: lecture.title,
      slides: [
        {
          slide: 2,
          heading: lecture.title,
          bullets: [lecture.answer],
          page: lecture.page,
        },
      ],
    };
    const quizPayload = {
      schema_version: LEARNER_BANK_SCHEMA_VERSION,
      owner_student_id: demo.registrationNumber,
      owner_book_id: bookId,
      generation_id: `discussion-${demo.registrationNumber}-week-${lecture.week}`,
      week: lecture.week,
      title: `${lecture.title} quiz`,
      questions: [
        {
          prompt: lecture.question,
          type: "mcq",
          options: ["A) The grounded answer", "B) A distractor", "C) None", "D) Unknown"],
          correct_option: "A",
          source: "lecture",
        },
      ],
    };

    await client.query(
      `INSERT INTO lecture_artifacts
        (artifact_id, book_id, student_id, week, title, lecture_payload,
         script_payload, slides_payload, quiz_payload, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$10)`,
      [
        artifactId,
        bookId,
        demo.registrationNumber,
        lecture.week,
        lecture.title,
        JSON.stringify(lecturePayload),
        JSON.stringify(scriptPayload),
        JSON.stringify(slidesPayload),
        JSON.stringify(quizPayload),
        BOOK_UPLOADED_AT,
      ],
    );
    const savedLecture = await client.query<{ id: number }>(
      `INSERT INTO lectures
        (public_id, book_id, lecture_artifact_id, week, title, starts_at, status, student_id)
       VALUES ($1,$2,$3,$4,$5,$6,'ready',$7)
       RETURNING id`,
      [
        publicId,
        bookId,
        artifactId,
        lecture.week,
        lecture.title,
        lecture.startsAt,
        demo.registrationNumber,
      ],
    );

    if (lecture.week <= demo.attendedWeeks) {
      const joinedAt = new Date(lecture.startsAt.getTime() + 2 * 60_000);
      const finishedAt = new Date(lecture.startsAt.getTime() + 45 * 60_000);
      await client.query(
        `INSERT INTO attendance
          (lecture_id, joined_at, status, late_minutes, completed_at, student_id,
           attended_seconds, is_connected, disconnect_count,
           last_sentence_index, total_sentences)
         VALUES ($1,$2,'on_time',2,$3,$4,2580,false,0,3,3)`,
        [savedLecture.rows[0].id, joinedAt, finishedAt, demo.registrationNumber],
      );
    }

    await client.query(
      `INSERT INTO grades
        (kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report, student_id)
       VALUES ('quiz',$1,$2,100,$3,$4,$5,false,$6::jsonb,$7)`,
      [
        lecture.week,
        demo.scores.quizPercentage,
        `Mock quiz ${lecture.week}: ${demo.outcome}`,
        new Date(lecture.startsAt.getTime() + 60 * 60_000),
        `discussion-${demo.registrationNumber}-quiz-${lecture.week}`,
        JSON.stringify({
          suspicion_score: 0,
          flagged: false,
          session_status: "completed",
          events: [],
          mock: true,
        }),
        demo.registrationNumber,
      ],
    );
  }

  const qaLecture = LECTURES[Math.min(demo.attendedWeeks, LECTURES.length) - 1];
  const qaLectureId = stableUuid("lecture", demoIndex, qaLecture.week);
  await client.query(
    `INSERT INTO qa_log
      (lecture_id, question, answer, citations, model_used, asked_at, student_id, trace_id)
     SELECT id,$1,$2,$3::jsonb,'discussion-demo',$4,$5,$6
       FROM lectures WHERE public_id = $7::uuid AND student_id = $5`,
    [
      qaLecture.question,
      qaLecture.answer,
      JSON.stringify([{ page: qaLecture.page, excerpt: qaLecture.answer }]),
      new Date(qaLecture.startsAt.getTime() + 25 * 60_000),
      demo.registrationNumber,
      `discussion-qa-${demo.registrationNumber}`,
      qaLectureId,
    ],
  );

  await client.query(
    `INSERT INTO grades
      (kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report, student_id)
     VALUES
      ('midterm',NULL,$1,100,$2,$3,$4,false,$5::jsonb,$6),
      ('final',NULL,$7,100,$8,$9,$10,false,$11::jsonb,$6)`,
    [
      demo.scores.midtermPercentage,
      `Mock midterm: ${demo.outcome}`,
      new Date("2026-01-20T12:00:00.000Z"),
      `discussion-${demo.registrationNumber}-midterm`,
      JSON.stringify({ flagged: false, session_status: "completed", mock: true }),
      demo.registrationNumber,
      demo.scores.finalPercentage,
      `Mock final: ${demo.outcome}`,
      COMPLETED_AT,
      `discussion-${demo.registrationNumber}-final`,
      JSON.stringify({
        suspicion_score: 0,
        flagged: false,
        session_status: "completed",
        grading_status: "graded",
        mock: true,
      }),
    ],
  );

  for (const lecture of LECTURES) {
    for (const stage of ["plan", "lecture", "quiz", "slides", "audio"] as const) {
      await client.query(
        `INSERT INTO course_generation_milestones
          (book_id, student_id, week, stage, status, attempt_count, progress,
           started_at, completed_at, updated_at)
         VALUES ($1,$2,$3,$4,'ready',1,'Mock artifact ready',$5,$6,$6)`,
        [
          bookId,
          demo.registrationNumber,
          lecture.week,
          stage,
          BOOK_UPLOADED_AT,
          new Date(lecture.startsAt.getTime() - 24 * 60 * 60_000),
        ],
      );
    }
  }
}

async function seedTranscript(
  client: PoolClient,
  demo: DemoJourney,
  score: ReturnType<typeof scoreCourse>,
  certificateImage: Buffer | null,
): Promise<void> {
  const id = transcriptId(demo);
  await client.query(
    `INSERT INTO course_transcripts
      (id, student_id, course_key, course_title, quiz_percentage, attendance_percentage,
       midterm_percentage, final_percentage, coursework_points, total_percentage,
       letter_grade, gpa, passed, completed_at, review_status, release_at,
       reviewed_at, review_note, notification_queued_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'released',$14,$14,$15,$14)`,
    [
      id,
      demo.registrationNumber,
      COURSE_KEY,
      COURSE_TITLE,
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
      `Discussion demo — ${demo.outcome}`,
    ],
  );

  if (!score.passed || !demo.preview || !certificateImage) return;
  await client.query(
    `INSERT INTO certificate_artifacts
      (id, transcript_id, student_id, template_key, filename, mime_type, image_data, issued_at)
     VALUES ($1,$2,$3,$4,$5,'image/png',$6,$7)`,
    [
      certificateId(demo),
      id,
      demo.registrationNumber,
      templateForGrade(score.letterGrade),
      demo.preview,
      certificateImage,
      COMPLETED_AT,
    ],
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: safeDatabaseUrl() });
  const outputDirectory = path.join(process.cwd(), "public", "certificates", "demo");
  await mkdir(outputDirectory, { recursive: true });

  for (const [index, demo] of DEMOS.entries()) {
    const score = scoreCourse(demo.scores);
    if (score.letterGrade !== demo.expectedGrade) {
      throw new Error(
        `${demo.email} expected ${demo.expectedGrade}, but the hard-coded journey produces ${score.letterGrade}.`,
      );
    }
    const transcript: CourseTranscript = {
      id: transcriptId(demo),
      courseKey: COURSE_KEY,
      courseTitle: COURSE_TITLE,
      ...score,
      completedAt: COMPLETED_AT.toISOString(),
      certificateId: score.passed ? certificateId(demo) : null,
      reviewStatus: "released",
      releaseAt: COMPLETED_AT.toISOString(),
      reviewedAt: COMPLETED_AT.toISOString(),
      reviewNote: `Discussion demo — ${demo.outcome}`,
    };
    const image = score.passed
      ? await renderCertificate({
          recipientName: demo.name,
          registrationNumber: demo.registrationNumber,
          transcript,
          certificateId: certificateId(demo),
          issuedAt: COMPLETED_AT,
        })
      : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await upsertLogin(client, demo);
      await resetJourney(client, demo);
      const { bookId } = await seedSourceAndProgramme(client, demo);
      await seedLectures(client, demo, index + 1, bookId);
      await seedTranscript(client, demo, score, image);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (demo.preview && image) {
      await writeFile(path.join(outputDirectory, demo.preview), image);
    }
    const artifact = score.passed ? `certificate ${demo.preview}` : "transcript only";
    console.log(
      `${demo.name}: ${demo.email} / ${demo.email} -> ${score.letterGrade} ` +
        `(${score.totalPercentage.toFixed(2)}%), ${artifact}`,
    );
  }
  await pool.end();
  console.log(`Course: ${COURSE_TITLE}`);
  console.log("All four lecture schedules are completed and the admin clock was not changed.");
  console.log(`Certificate previews: ${outputDirectory}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
