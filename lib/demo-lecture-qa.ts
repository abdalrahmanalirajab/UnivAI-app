import "server-only";

import { Buffer } from "node:buffer";
import type { PoolClient } from "pg";
import { pool, queryOne } from "./db";
import { now } from "./clock";
import {
  CreditError,
  releaseCreditReservation,
  reserveCredits,
  settleCreditReservationWithClient,
} from "./credits";
import { parseJsonLine, runPython } from "./python";
import { classifyDemoLectureIntent, type DemoLectureIntent } from "./demo-lecture-intents";
import { raiseHandFeedbackTarget } from "./ai-output-feedback-types";
import { ensureAiOutputFeedbackSchema } from "./ai-output-feedback";
import type { AuthorizedLectureBundle } from "./demo-media-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QuestionInput = {
  requestId: string;
  question: string;
  scriptDigest: string;
  currentCue: number;
  slide: number;
};

type QaRow = {
  id: number;
  question: string;
  answer: string;
  citations: unknown;
  context_snapshot: Record<string, unknown> | null;
  trace_id: string;
  feedback_submitted?: boolean;
};

type BridgeEnvelope = {
  ok?: boolean;
  error?: string;
  result?: {
    status?: unknown;
    answer?: unknown;
    pages?: unknown;
    citations?: unknown;
    model_used?: unknown;
  };
};

export class DemoQuestionError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "DemoQuestionError";
  }
}

function normalizeInput(value: unknown, bundle: AuthorizedLectureBundle): QuestionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DemoQuestionError("Invalid question.", 400, "INVALID_QUESTION");
  const body = value as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 2_000) throw new DemoQuestionError("Enter a question between 1 and 2,000 characters.", 400, "INVALID_QUESTION");
  if (typeof body.requestId !== "string" || !UUID.test(body.requestId)) throw new DemoQuestionError("Invalid question request ID.", 400, "INVALID_REQUEST_ID");
  if (body.scriptDigest !== bundle.manifest.scriptDigest) throw new DemoQuestionError("The lecture content changed. Reload before asking.", 409, "STALE_ARTIFACT");
  if (!Number.isInteger(body.currentCue) || Number(body.currentCue) < 0 || Number(body.currentCue) >= bundle.manifest.cues.length) throw new DemoQuestionError("Your lecture position is invalid. Refresh and try again.", 400, "INVALID_POSITION");
  const furthestAllowedCue = Math.min(bundle.manifest.cues.length - 1, Math.max(0, bundle.row.last_sentence_index ?? 0));
  if (Number(body.currentCue) > furthestAllowedCue) throw new DemoQuestionError("Future lecture material is not available yet.", 409, "FUTURE_POSITION");
  const cue = bundle.manifest.cues[Number(body.currentCue)];
  if (body.slide !== cue.slide) throw new DemoQuestionError("The lecture moved to another slide. Please try again.", 409, "STALE_POSITION");
  return { requestId: body.requestId, question, scriptDigest: body.scriptDigest, currentCue: Number(body.currentCue), slide: Number(body.slide) };
}

function pages(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => typeof entry === "number" ? entry : Number((entry as Record<string, unknown>)?.page)).filter((page) => Number.isInteger(page) && page > 0))];
}

function responseFromRow(row: QaRow) {
  const answerPages = pages(row.citations);
  const slide = Number((row.context_snapshot?.current_slide as Record<string, unknown> | undefined)?.number);
  return {
    kind: "answer" as const,
    turn: { id: String(row.id), question: row.question, answer: row.answer, pages: answerPages, slide: Number.isInteger(slide) && slide > 0 ? slide : null },
    citations: Array.isArray(row.citations) ? row.citations : [],
    feedbackTarget: raiseHandFeedbackTarget(row.id, row.trace_id),
    charged: Boolean(answerPages.length),
  };
}

async function existingAnswer(sid: string, lectureInternalId: number, traceId: string): Promise<QaRow | null> {
  return queryOne<QaRow>(
    `SELECT id, question, answer, citations, context_snapshot, trace_id
       FROM qa_log
      WHERE student_id = $1 AND lecture_id = $2 AND trace_id = $3`,
    [sid, lectureInternalId, traceId],
  );
}

export async function getDemoLectureHistory(sid: string, lectureInternalId: number) {
  await ensureAiOutputFeedbackSchema();
  const result = await pool.query<QaRow>(
    `SELECT id, question, answer, citations, context_snapshot, trace_id,
            (EXISTS (
               SELECT 1 FROM ai_output_reactions AS reaction
                WHERE reaction.student_id = $1
                  AND reaction.target_type = 'raise_hand_answer'
                  AND reaction.target_id = recent.id::text
                  AND reaction.target_version = '1'
             ) OR EXISTS (
               SELECT 1 FROM ai_output_reports AS report
                WHERE report.student_id = $1
                  AND report.target_type = 'raise_hand_answer'
                  AND report.target_id = recent.id::text
                  AND report.target_version = '1'
             )) AS feedback_submitted
       FROM (
         SELECT id, question, answer, citations, context_snapshot, trace_id, asked_at
           FROM qa_log
          WHERE student_id = $1 AND lecture_id = $2
          ORDER BY asked_at DESC, id DESC
          LIMIT 20
       ) AS recent
      ORDER BY asked_at, id`,
    [sid, lectureInternalId],
  );
  return result.rows.map((row) => {
    const response = responseFromRow(row);
    return { turn: response.turn, feedbackTarget: response.feedbackTarget, feedbackSubmitted: Boolean(row.feedback_submitted) };
  });
}

async function conversationContext(sid: string, bundle: AuthorizedLectureBundle, contextCue: number, contextSlide: number) {
  const distinctSlides = [...new Set(bundle.manifest.cues.map((cue) => cue.slide))];
  const slidePosition = distinctSlides.indexOf(contextSlide);
  const previousSlide = slidePosition > 0 ? distinctSlides[slidePosition - 1] : null;
  const slideText = (slide: number | null) => slide === null ? null : {
    number: slide,
    text: bundle.manifest.cues.filter((cue) => cue.slide === slide).map((cue) => cue.text).join(" ").slice(0, 2_000),
  };
  const historyResult = await pool.query<{ question: string; answer: string; slide_number: number | null }>(
    `SELECT question, answer,
            CASE WHEN (context_snapshot->'current_slide'->>'number') ~ '^[0-9]+$'
                 THEN (context_snapshot->'current_slide'->>'number')::integer ELSE NULL END AS slide_number
       FROM qa_log
      WHERE student_id = $1 AND lecture_id = $2
      ORDER BY asked_at DESC, id DESC
      LIMIT 6`,
    [sid, bundle.row.internal_id],
  );
  return {
    current_slide: slideText(contextSlide),
    previous_slide: slideText(previousSlide),
    history: historyResult.rows.reverse().map((row) => ({ question: row.question.slice(0, 500), answer: row.answer.slice(0, 1_200), slide_number: row.slide_number })),
    cue_index: contextCue,
  };
}

export async function answerDemoLectureQuestion(input: {
  userId: string;
  sid: string;
  bundle: AuthorizedLectureBundle;
  body: unknown;
  previousWeekAvailable: boolean;
  signal?: AbortSignal;
}) {
  const question = normalizeInput(input.body, input.bundle);
  const previous = await existingAnswer(input.sid, input.bundle.row.internal_id, question.requestId);
  if (previous) return responseFromRow(previous);
  const furthest = Math.min(input.bundle.manifest.cues.length, Math.max(0, input.bundle.row.last_sentence_index ?? 0));
  const intent = classifyDemoLectureIntent({
    question: question.question,
    manifest: input.bundle.manifest,
    currentCue: question.currentCue,
    furthestCompletedCue: furthest,
    previousWeekAvailable: input.previousWeekAvailable,
  });
  if (intent.kind !== "question") return { kind: "command" as const, command: intent, charged: false };
  if (intent.contextCue > question.currentCue) {
    return {
      kind: "command" as const,
      command: { kind: "message" as const, message: "I will keep future lecture material hidden until the narration reaches it." },
      charged: false,
    };
  }

  const reservation = await reserveCredits({
    userId: input.userId,
    purpose: "raise_hand",
    idempotencyKey: `demo-raise-hand:${input.userId}:${question.requestId}`,
    referenceType: "lecture",
    referenceId: input.bundle.row.public_id,
    ttlSeconds: 10 * 60,
  });
  const generated = await (async () => {
    const context = await conversationContext(input.sid, input.bundle, intent.contextCue, intent.contextSlide);
    const encoded = Buffer.from(JSON.stringify({
      question: question.question,
      student_id: input.sid,
      lecture_internal_id: input.bundle.row.internal_id,
      lecture_public_id: input.bundle.row.public_id,
      programme_id: String(input.bundle.row.programme_id),
      course_id: input.bundle.row.script_payload.lectureId,
      plan_version: input.bundle.row.plan_version,
      context_snapshot: context,
    }), "utf8").toString("base64url");
    const process = await runPython("services/rag-tools/regenerate_answer.py", [encoded], 45_000, input.signal);
    return { context, process };
  })().catch(async () => {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new DemoQuestionError("The grounded answer service failed. No Credits were charged.", 502, "ANSWER_GENERATION_FAILED");
  });
  const { context, process } = generated;
  const envelope = parseJsonLine<BridgeEnvelope>(process.stdout);
  const result = envelope?.result;
  const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
  const citations = Array.isArray(result?.citations) ? result.citations : [];
  const grounded = process.ok && envelope?.ok && result?.status === "answered" && Boolean(answer) && citations.length > 0;
  const failedMessage = envelope?.error ?? (answer || "A grounded answer could not be prepared. No Credits were charged.");

  if (!grounded) {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
  }
  let client: PoolClient | null = null;
  let row: QaRow | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const inserted = await client.query<QaRow>(
      `INSERT INTO qa_log
         (student_id, lecture_id, question, answer, citations, model_used,
          asked_at, context_snapshot, credit_reservation_id, trace_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::uuid, $10)
       ON CONFLICT (trace_id) DO NOTHING
       RETURNING id, question, answer, citations, context_snapshot, trace_id`,
      [input.sid, input.bundle.row.internal_id, question.question, grounded ? answer : failedMessage, JSON.stringify(grounded ? citations : []), typeof result?.model_used === "string" ? result.model_used : null, await now(), JSON.stringify(context), reservation.id, question.requestId],
    );
    row = inserted.rows[0] ?? null;
    if (grounded && row) await settleCreditReservationWithClient(client, input.userId, reservation.id);
    await client.query("COMMIT");
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (grounded) await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    if (error instanceof CreditError) throw error;
    throw new DemoQuestionError("The answer could not be saved. No Credits were charged.", 500, "ANSWER_SAVE_FAILED");
  } finally {
    client?.release();
  }
  row ??= await existingAnswer(input.sid, input.bundle.row.internal_id, question.requestId);
  if (!row) throw new DemoQuestionError("The answer could not be saved.", 500, "ANSWER_SAVE_FAILED");
  return responseFromRow(row);
}

export type { DemoLectureIntent };
