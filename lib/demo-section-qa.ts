import "server-only";

import { Buffer } from "node:buffer";
import type { PoolClient } from "pg";
import { pool, queryOne } from "./db";
import { now } from "./clock";
import { releaseCreditReservation, reserveCredits, settleCreditReservationWithClient } from "./credits";
import { parseJsonLine, runPython } from "./python";
import { raiseHandFeedbackTarget } from "./ai-output-feedback-types";
import type { AuthorizedSectionBundle } from "./demo-media-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Saved = { id: number; question: string; answer: string; citations: unknown; trace_id: string };
type Envelope = { ok?: boolean; error?: string; result?: { status?: unknown; answer?: unknown; citations?: unknown; model_used?: unknown } };

export class DemoSectionQuestionError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "DemoSectionQuestionError";
  }
}

export async function answerDemoSectionQuestion(input: {
  userId: string;
  sid: string;
  bundle: AuthorizedSectionBundle;
  body: unknown;
  signal?: AbortSignal;
}) {
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body) ? input.body as Record<string, unknown> : {};
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const nodeId = typeof body.nodeId === "string" ? body.nodeId : "";
  if (!UUID.test(requestId) || !question || question.length > 2_000) throw new DemoSectionQuestionError("Enter a valid section question.", 400, "INVALID_QUESTION");
  if (body.payloadHash !== input.bundle.section.payloadHash) throw new DemoSectionQuestionError("The section was updated. Refresh before asking.", 409, "STALE_SECTION");
  const nodeIndex = input.bundle.manifest.nodes.findIndex((node) => node.id === nodeId);
  if (nodeIndex < 0) throw new DemoSectionQuestionError("The section question points at an unknown step.", 400, "INVALID_SECTION_STEP");
  const saved = await queryOne<Saved>(
    `SELECT id, question, answer, citations, trace_id FROM qa_log
      WHERE student_id = $1 AND lecture_id = $2 AND trace_id = $3`,
    [input.sid, input.bundle.section.lectureInternalId, requestId],
  );
  if (saved) return savedResponse(saved);

  const reservation = await reserveCredits({
    userId: input.userId,
    purpose: "raise_hand",
    idempotencyKey: `demo-section-question:${input.userId}:${requestId}`,
    referenceType: "section",
    referenceId: input.bundle.section.id,
    ttlSeconds: 10 * 60,
  });
  const node = input.bundle.manifest.nodes[nodeIndex];
  const previous = nodeIndex > 0 ? input.bundle.manifest.nodes[nodeIndex - 1] : null;
  const generated = await (async () => {
    const context = {
      current_slide: { number: nodeIndex + 1, text: `${node.title}. ${node.text}`.slice(0, 2_000) },
      previous_slide: previous ? { number: nodeIndex, text: `${previous.title}. ${previous.text}`.slice(0, 2_000) } : null,
      history: [],
    };
    const encoded = Buffer.from(JSON.stringify({
      question,
      student_id: input.sid,
      lecture_internal_id: input.bundle.section.lectureInternalId,
      lecture_public_id: input.bundle.section.lecturePublicId,
      programme_id: input.bundle.section.programmeId,
      course_id: String(input.bundle.section.payload.course_id ?? ""),
      plan_version: input.bundle.section.planVersion,
      context_snapshot: context,
    }), "utf8").toString("base64url");
    const process = await runPython("services/rag-tools/regenerate_answer.py", [encoded], 45_000, input.signal);
    return { context, process };
  })().catch(async () => {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new DemoSectionQuestionError("The grounded answer service failed. No Credits were charged.", 502, "ANSWER_GENERATION_FAILED");
  });
  const { context, process } = generated;
  const envelope = parseJsonLine<Envelope>(process.stdout);
  const result = envelope?.result;
  const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
  const citations = Array.isArray(result?.citations) ? result.citations : [];
  const grounded = process.ok && envelope?.ok && result?.status === "answered" && Boolean(answer) && citations.length > 0;
  if (!grounded) {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new DemoSectionQuestionError("A grounded section answer could not be prepared. No Credits were charged.", 502, "ANSWER_NOT_GROUNDED");
  }

  let client: PoolClient | null = null;
  let inserted: Saved | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const resultRow = await client.query<Saved>(
      `INSERT INTO qa_log
         (student_id, lecture_id, question, answer, citations, model_used,
          asked_at, context_snapshot, credit_reservation_id, trace_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::uuid, $10)
       ON CONFLICT (trace_id) DO NOTHING
       RETURNING id, question, answer, citations, trace_id`,
      [input.sid, input.bundle.section.lectureInternalId, question, answer, JSON.stringify(citations), typeof result?.model_used === "string" ? result.model_used : null, await now(), JSON.stringify(context), reservation.id, requestId],
    );
    inserted = resultRow.rows[0] ?? null;
    if (inserted) await settleCreditReservationWithClient(client, input.userId, reservation.id);
    await client.query("COMMIT");
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new DemoSectionQuestionError("The section answer could not be saved. No Credits were charged.", 500, "ANSWER_SAVE_FAILED");
  } finally {
    client?.release();
  }
  inserted ??= await queryOne<Saved>(
    `SELECT id, question, answer, citations, trace_id FROM qa_log
      WHERE student_id = $1 AND lecture_id = $2 AND trace_id = $3`,
    [input.sid, input.bundle.section.lectureInternalId, requestId],
  );
  if (!inserted) throw new DemoSectionQuestionError("The section answer could not be saved.", 500, "ANSWER_SAVE_FAILED");
  return savedResponse(inserted);
}

function savedResponse(row: Saved) {
  const citations = Array.isArray(row.citations) ? row.citations : [];
  return {
    answer: row.answer,
    citations,
    feedbackTarget: raiseHandFeedbackTarget(row.id, row.trace_id),
  };
}
