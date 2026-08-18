import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { pool, queryOne } from "./db";
import {
  CreditError,
  releaseCreditReservation,
  reserveCredits,
  settleCreditReservationWithClient,
} from "./credits";
import { env } from "./env";
import { ensureExamWorld, EXAM_SYSTEM_URL } from "./exams";
import { requireTrustedExamLaunchUrl } from "./exam-launch";
import { parseJsonLine, runPython } from "./python";

type PracticeSource = {
  internal_id: number;
  public_id: string;
  week: number;
  title: string;
  script_payload: { segments?: Array<{ heading?: unknown; text?: unknown }> } | null;
  collection_id: number;
  plan_version: number;
};

type PracticeAttemptRow = {
  id: string;
  credit_reservation_id: string;
  package_id: string;
  exam_id: string | null;
  status: "generating" | "ready" | "failed";
  error: string | null;
};

type AgentCitation = {
  collection_id?: unknown;
  document_id?: unknown;
  book_title?: unknown;
  page?: unknown;
  section?: unknown;
};

type AgentQuestion = {
  prompt?: unknown;
  options?: unknown;
  correct_option?: unknown;
  citations?: unknown;
};

type BridgeEnvelope = {
  ok?: boolean;
  error?: string;
  result?: {
    status?: unknown;
    error?: unknown;
    assessment?: {
      title?: unknown;
      assessment_type?: unknown;
      questions?: unknown;
    };
  };
};

type ExamLaunch = { _id?: unknown; launch_url?: unknown };

export class PracticeAssessmentError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PracticeAssessmentError";
  }
}

async function practiceSource(registrationNumber: string, lectureId: string): Promise<PracticeSource> {
  const source = await queryOne<PracticeSource>(
    `SELECT lecture.id AS internal_id, lecture.public_id::text AS public_id,
            lecture.week, lecture.title, artifact.script_payload,
            approved.collection_id, approved.plan_version
       FROM lectures AS lecture
       JOIN lecture_artifacts AS artifact ON artifact.artifact_id = lecture.lecture_artifact_id
       JOIN books AS book ON book.id = artifact.book_id
       JOIN LATERAL (
         SELECT programme.collection_id, programme.plan_version
           FROM programmes AS programme
          WHERE programme.student_id = lecture.student_id
            AND programme.status = 'approved'
            AND EXISTS (
              SELECT 1 FROM documents
               WHERE documents.collection_id = programme.collection_id
                 AND documents.student_id = lecture.student_id
                 AND documents.filename = book.filename
            )
          ORDER BY programme.approved_at DESC NULLS LAST,
                   programme.id DESC
          LIMIT 1
       ) AS approved ON true
      WHERE lecture.student_id = $1 AND lecture.public_id = $2::uuid`,
    [registrationNumber, lectureId],
  );
  if (!source) throw new PracticeAssessmentError("That lecture is not available for practice.", 404);
  return source;
}

function topicSummary(source: PracticeSource): string {
  const text = (source.script_payload?.segments ?? [])
    .flatMap((segment) => [segment.heading, segment.text])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  return text.slice(0, 18_000) || source.title;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildQuestions(
  value: unknown,
  packageId: string,
  planVersion: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new PracticeAssessmentError("The Agent did not return exactly five practice questions.", 502);
  }
  return value.map((raw, index) => {
    const question = raw as AgentQuestion;
    const prompt = text(question.prompt);
    const options = Array.isArray(question.options)
      ? question.options.map(text).filter((item): item is string => item !== null)
      : [];
    const label = text(question.correct_option);
    const correctIndex = label ? "ABCD".indexOf(label.toUpperCase()) : -1;
    const citation = Array.isArray(question.citations)
      ? question.citations[0] as AgentCitation | undefined
      : undefined;
    const documentId = text(citation?.document_id);
    const documentTitle = text(citation?.book_title);
    const section = text(citation?.section);
    const pageNumber = citation?.page;
    if (
      !prompt || options.length !== 4 || new Set(options).size !== 4 ||
      correctIndex < 0 || !documentId || !documentTitle || !section ||
      !Number.isInteger(pageNumber) || Number(pageNumber) < 1
    ) {
      throw new PracticeAssessmentError(
        "The generated practice package was not fully grounded. No Credits were charged.",
        502,
      );
    }
    return {
      schema_version: "question-provenance-v1",
      question_id: `${packageId}:${index + 1}`,
      prompt,
      type: "mcq",
      options,
      correct_option: options[correctIndex],
      plan_version: planVersion,
      approved: true,
      provenance: {
        document_id: documentId,
        document_title: documentTitle,
        page_number: Number(pageNumber),
        section,
      },
    };
  });
}

async function examRequest(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
  if (!env.UNIVAI_AGENT_SECRET && env.UNIVAI_MODE !== "standalone") {
    throw new PracticeAssessmentError("Practice exams are not configured.", 503);
  }
  const response = await fetch(`${EXAM_SYSTEM_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-univai-agent-token": env.UNIVAI_AGENT_SECRET,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null) as (ExamLaunch & { error?: string }) | null;
  if (!response.ok) {
    throw new PracticeAssessmentError(payload?.error ?? "The practice exam could not be opened.", response.status);
  }
  return {
    examId: text(payload?._id),
    launchUrl: requireTrustedExamLaunchUrl(payload, EXAM_SYSTEM_URL),
  };
}

async function resumeAttempt(
  attempt: PracticeAttemptRow,
  registrationNumber: string,
  studentId: string,
) {
  if (attempt.status !== "ready" || !attempt.exam_id) {
    throw new PracticeAssessmentError(
      attempt.status === "generating"
        ? "This practice quiz is still being generated."
        : attempt.error ?? "This practice quiz is unavailable.",
      409,
    );
  }
  return examRequest(`/api/exams/practice/${attempt.exam_id}/resume`, {
    student_id: studentId,
    student_sid: registrationNumber,
  });
}

export async function generatePracticeAssessment(input: {
  userId: string;
  registrationNumber: string;
  studentName: string;
  lectureId: string;
  idempotencyKey: string;
}) {
  const source = await practiceSource(input.registrationNumber, input.lectureId);
  const reservation = await reserveCredits({
    userId: input.userId,
    purpose: "practice_quiz",
    idempotencyKey: `practice:${input.userId}:${input.idempotencyKey}`,
    referenceType: "lecture",
    referenceId: input.lectureId,
    ttlSeconds: 60 * 60,
  });
  const packageId = `practice-${input.lectureId}-${randomUUID()}`;
  const created = await queryOne<PracticeAttemptRow>(
    `INSERT INTO practice_attempts
       (user_id, student_id, lecture_public_id, credit_reservation_id, package_id)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5)
     ON CONFLICT (credit_reservation_id) DO NOTHING
     RETURNING id::text, credit_reservation_id::text, package_id, exam_id, status, error`,
    [input.userId, input.registrationNumber, input.lectureId, reservation.id, packageId],
  );
  const attempt = created ?? await queryOne<PracticeAttemptRow>(
    `SELECT id::text, credit_reservation_id::text, package_id, exam_id, status, error
       FROM practice_attempts
      WHERE credit_reservation_id = $1::uuid AND user_id = $2::uuid`,
    [reservation.id, input.userId],
  );
  if (!attempt) {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new PracticeAssessmentError("The practice request could not be saved.", 500);
  }
  if (!created || attempt.status !== "generating") {
    const world = await ensureExamWorld(input.registrationNumber, input.studentName);
    return resumeAttempt(attempt, input.registrationNumber, world.student_id);
  }

  try {
    const world = await ensureExamWorld(input.registrationNumber, input.studentName);
    const chapter = world.chapters.find((item) => item.week === source.week);
    if (!chapter) throw new PracticeAssessmentError("The lecture chapter is not ready in Exams.", 409);
    const encoded = Buffer.from(JSON.stringify({
      topic_id: input.lectureId,
      topic_title: source.title,
      topic_summary: topicSummary(source),
      collection_id: String(source.collection_id),
      user_id: input.registrationNumber,
      document_ids: [],
    }), "utf8").toString("base64url");
    const process = await runPython("services/rag-tools/generate_practice.py", [encoded], 210_000);
    const envelope = parseJsonLine<BridgeEnvelope>(process.stdout);
    const result = envelope?.result;
    if (!process.ok || !envelope?.ok || result?.status !== "accepted") {
      throw new PracticeAssessmentError(
        text(result?.error) ?? envelope?.error ?? "Grounded practice generation failed. No Credits were charged.",
        502,
      );
    }
    const planVersion = `practice-plan-${source.plan_version}`;
    const questions = buildQuestions(result.assessment?.questions, attempt.package_id, planVersion);
    const generatedTitle = text(result.assessment?.title) ?? `${source.title} practice`;
    const launch = await examRequest("/api/exams/practice/start", {
      student_id: world.student_id,
      curriculum_id: world.curriculum_id,
      chapter_id: chapter.chapter_id,
      student_sid: input.registrationNumber,
      package_id: attempt.package_id,
      title: generatedTitle,
      plan_version: planVersion,
      questions,
    }, `practice-start:${attempt.package_id}`);
    if (!launch.examId) throw new PracticeAssessmentError("The practice launch is missing its exam id.", 502);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE practice_attempts
            SET status = 'ready', exam_id = $2, error = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1::uuid`,
        [attempt.id, launch.examId],
      );
      await settleCreditReservationWithClient(client, input.userId, reservation.id);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return launch;
  } catch (error) {
    await queryOne(
      `UPDATE practice_attempts
          SET status = 'failed', error = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid RETURNING id`,
      [attempt.id, error instanceof Error ? error.message.slice(0, 1_000) : "Practice generation failed"],
    ).catch(() => undefined);
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    if (error instanceof CreditError || error instanceof PracticeAssessmentError) throw error;
    throw new PracticeAssessmentError("Practice generation failed. No Credits were charged.", 502);
  }
}

export async function resumeLatestPracticeAssessment(input: {
  userId: string;
  registrationNumber: string;
  studentName: string;
  lectureId: string;
}) {
  await practiceSource(input.registrationNumber, input.lectureId);
  const attempt = await queryOne<PracticeAttemptRow>(
    `SELECT id::text, credit_reservation_id::text, package_id, exam_id, status, error
       FROM practice_attempts
      WHERE user_id = $1::uuid AND student_id = $2 AND lecture_public_id = $3::uuid
        AND status = 'ready'
      ORDER BY created_at DESC LIMIT 1`,
    [input.userId, input.registrationNumber, input.lectureId],
  );
  if (!attempt) throw new PracticeAssessmentError("No resumable practice quiz was found.", 404);
  const world = await ensureExamWorld(input.registrationNumber, input.studentName);
  return resumeAttempt(attempt, input.registrationNumber, world.student_id);
}
