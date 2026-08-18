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
import { getRaisedHandOutput, type OutputVersion } from "./feedback";
import { now } from "./clock";
import { parseJsonLine, runPython } from "./python";

type SourceRow = {
  id: number;
  lecture_internal_id: number;
  lecture_public_id: string;
  question: string;
  context_snapshot: Record<string, unknown> | null;
};

type SavedRegenerationRow = {
  id: number;
  lecture_public_id: string;
  question: string;
  answer: string;
  citations: unknown;
  context_snapshot: Record<string, unknown> | null;
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

export type RegeneratedAnswer = {
  turn: {
    id: string;
    question: string;
    answer: string;
    pages: number[];
    slide: number | null;
  };
  output: OutputVersion;
};

export class AnswerRegenerationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "AnswerRegenerationError";
  }
}

function pages(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const values = value
    .map((entry) =>
      typeof entry === "number"
        ? entry
        : entry && typeof entry === "object"
          ? Number((entry as Record<string, unknown>).page)
          : Number.NaN,
    )
    .filter((page): page is number => Number.isInteger(page) && page > 0);
  return [...new Set(values)];
}

function currentSlide(context: Record<string, unknown> | null): number | null {
  const current = context?.current_slide;
  if (!current || typeof current !== "object") return null;
  const number = (current as Record<string, unknown>).number;
  return Number.isInteger(number) && Number(number) > 0 ? Number(number) : null;
}

async function savedRegeneration(
  registrationNumber: string,
  row: SavedRegenerationRow,
): Promise<RegeneratedAnswer> {
  const output = await getRaisedHandOutput(registrationNumber, Number(row.id));
  if (!output) {
    throw new AnswerRegenerationError(
      "The replacement answer was saved but its sources are still syncing.",
      503,
    );
  }
  return {
    turn: {
      id: String(row.id),
      question: row.question,
      answer: row.answer,
      pages: pages(row.citations),
      slide: currentSlide(row.context_snapshot),
    },
    output,
  };
}

function findSavedRegeneration(
  registrationNumber: string,
  reservationId: string,
): Promise<SavedRegenerationRow | null> {
  return queryOne<SavedRegenerationRow>(
    `SELECT q.id, lecture.public_id::text AS lecture_public_id,
            q.question, q.answer, q.citations, q.context_snapshot
       FROM qa_log AS q
       JOIN lectures AS lecture
         ON lecture.id = q.lecture_id AND lecture.student_id = q.student_id
      WHERE q.student_id = $1 AND q.credit_reservation_id = $2::uuid`,
    [registrationNumber, reservationId],
  );
}

export async function regenerateRaisedHandAnswer(input: {
  userId: string;
  registrationNumber: string;
  answerId: number;
  idempotencyKey: string;
}): Promise<RegeneratedAnswer> {
  const source = await queryOne<SourceRow>(
    `SELECT q.id, q.lecture_id AS lecture_internal_id,
            lecture.public_id::text AS lecture_public_id,
            q.question, q.context_snapshot
       FROM qa_log AS q
       JOIN lectures AS lecture
         ON lecture.id = q.lecture_id AND lecture.student_id = q.student_id
      WHERE q.id = $1 AND q.student_id = $2`,
    [input.answerId, input.registrationNumber],
  );
  if (!source) throw new AnswerRegenerationError("That raised-hand answer was not found.", 404);

  const reservation = await reserveCredits({
    userId: input.userId,
    purpose: "answer_regeneration",
    idempotencyKey: `answer-regeneration:${input.userId}:${input.idempotencyKey}`,
    referenceType: "qa_log",
    referenceId: String(source.id),
    ttlSeconds: 10 * 60,
  });
  const previous = await findSavedRegeneration(input.registrationNumber, reservation.id);
  if (previous) return savedRegeneration(input.registrationNumber, previous);

  const encoded = Buffer.from(JSON.stringify({
    question: source.question,
    student_id: input.registrationNumber,
    lecture_internal_id: source.lecture_internal_id,
    lecture_public_id: source.lecture_public_id,
    context_snapshot: source.context_snapshot ?? {},
  }), "utf8").toString("base64url");
  const process = await runPython("services/rag-tools/regenerate_answer.py", [encoded], 120_000);
  const envelope = parseJsonLine<BridgeEnvelope>(process.stdout);
  const result = envelope?.result;
  const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
  const answerPages = pages(result?.pages);
  const citations = Array.isArray(result?.citations) ? result.citations : [];
  if (!process.ok || !envelope?.ok || result?.status !== "answered" || !answer || !citations.length) {
    await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
    throw new AnswerRegenerationError(
      envelope?.error ?? "A grounded replacement answer could not be generated. No Credits were charged.",
      502,
    );
  }

  const client = await pool.connect();
  let insertedId: number | null = null;
  let duplicate: SavedRegenerationRow | null = null;
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO qa_log
         (student_id, lecture_id, question, answer, citations, model_used,
          asked_at, parent_qa_id, context_snapshot, credit_reservation_id, trace_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::uuid, $11)
       RETURNING id`,
      [
        input.registrationNumber,
        source.lecture_internal_id,
        source.question,
        answer,
        JSON.stringify(citations),
        typeof result?.model_used === "string" ? result.model_used : null,
        await now(),
        source.id,
        JSON.stringify(source.context_snapshot ?? {}),
        reservation.id,
        randomUUID(),
      ],
    );
    insertedId = inserted.rows[0]?.id ?? null;
    if (!insertedId) throw new Error("The regenerated answer was not saved.");
    await settleCreditReservationWithClient(client, input.userId, reservation.id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      duplicate = await findSavedRegeneration(input.registrationNumber, reservation.id);
    }
    if (!duplicate) {
      await releaseCreditReservation(input.userId, reservation.id).catch(() => undefined);
      if (error instanceof CreditError) throw error;
      throw new AnswerRegenerationError("The replacement answer could not be saved. No Credits were charged.", 500);
    }
  } finally {
    client.release();
  }

  if (duplicate) return savedRegeneration(input.registrationNumber, duplicate);
  const saved: SavedRegenerationRow = {
    id: insertedId!,
    lecture_public_id: source.lecture_public_id,
    question: source.question,
    answer,
    citations,
    context_snapshot: source.context_snapshot,
  };
  const regenerated = await savedRegeneration(input.registrationNumber, saved);
  regenerated.turn.pages = answerPages;
  return regenerated;
}
