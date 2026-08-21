import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { query, queryOne } from "@/lib/db";
import { now } from "@/lib/clock";
import {
  examCallbackFingerprint,
  ensureExamWorld,
  getFinalExamAvailability,
  parseResultWebhook,
  recordExamCallback,
  resolveWeek,
  saveFinalExamStatus,
  wasExamCallbackProcessed,
  webhookToFinalExamStatus,
} from "@/lib/exams";
import {
  ensureFinalExamCase,
  recordFinalExamCallback,
  type StoredFinalResult,
} from "@/lib/final-exam-retakes";
import { enqueueStudentEmailNotification } from "@/lib/notification-outbox";

export const dynamic = "force-dynamic";

/**
 * The exam system POSTs here after every submission (and again after a manual
 * final grade): the grade plus the proctoring report. We verify the callback's
 * signature first, store the grade, and keep the final's display status in
 * sync — the dashboard shows the score and the exams page shows the final's
 * service-reported state.
 *
 * Signature contract (the exam system signs with the same shared secret):
 *   X-Exam-Signature: <lowercase hex HMAC-SHA256 of the RAW request body,
 *   keyed by EXAM_CALLBACK_SECRET>
 * The raw bytes are hashed — not the parsed JSON — so a re-serialised body
 * would fail verification. The secret comes from environment configuration
 * only; without it the route fails closed and rejects every callback.
 *
 * A clean final remains provisional until the retake lifecycle finalizes it.
 */
export async function POST(request: NextRequest) {
  // Read the raw body FIRST — the signature covers the exact delivered bytes.
  const raw = await request.text().catch(() => null);
  if (raw === null) {
    return Response.json({ error: "Unreadable request body." }, { status: 400 });
  }

  if (!verifyExamCallbackSignature(raw, request.headers.get("x-exam-signature"))) {
    // No details, no secret, no signature material in the response or logs.
    return Response.json({ error: "Invalid callback signature." }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "Malformed callback payload." }, { status: 400 });
  }

  const validated = parseResultWebhook(parsed);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const payload = validated.payload;

  // The exam system echoes the owner it was handed at start time (student_sid).
  // Runtime validation above guarantees a non-empty tenant key.
  const sid = payload.student_sid;

  // Idempotency: a re-delivered callback (same exam id + same event
  // fingerprint) is acknowledged but never re-applied — no duplicate grade
  // row, no duplicate state change. A genuinely different event (e.g. the
  // manual "graded" verdict arriving after "pending_review") has a different
  // fingerprint and IS processed.
  const fingerprint = examCallbackFingerprint(payload);
  if (await wasExamCallbackProcessed(payload.exam_id, fingerprint)) {
    return Response.json({ ok: true, idempotent: true });
  }

  // Finals are course-level assessments and have no week to resolve. Keeping
  // them out of resolveWeek prevents the non-quiz resolver from ever
  // misclassifying a final as a midterm.
  const { kind, week } = payload.type === "final"
    ? { kind: "final" as const, week: null }
    : await resolveWeek({
        type: payload.type,
        chapter_id: payload.chapter_id,
        exam_id: payload.exam_id,
        student_sid: sid,
      });
  const takenAt = await now();

  const flagged =
    Boolean(payload.report?.flagged) || payload.integrity_status === "invalidated";
  const storedReport = {
    ...(payload.report ?? {}),
    integrity_status: payload.integrity_status,
  };
  const penaltyApplied =
    payload.integrity_status !== "invalidated" &&
    payload.report.integrity_penalty_applied === true;
  const feedback = payload.integrity_status === "invalidated"
    ? "Invalidated by proctoring."
    : penaltyApplied
      ? "Integrity flag applied; the recorded score is half the original score, rounded up."
      : payload.passed
        ? "Passed."
        : "Below the pass mark.";

  const isFinal = payload.type === "final";
  // Review/invalidated callbacks never create the course's final grade.
  const finalGradeConfirmed =
    isFinal &&
    !flagged &&
    (payload.grading_status === "auto_graded" || payload.grading_status === "graded") &&
    payload.mark !== null &&
    payload.mark !== undefined &&
    payload.max_score > 0;

  if (!isFinal) {
    await query(
      `INSERT INTO grades (student_id, kind, week, score, max_score, feedback, taken_at, exam_id, flagged, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (exam_id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         kind = EXCLUDED.kind,
         week = EXCLUDED.week,
         score = EXCLUDED.score,
         max_score = EXCLUDED.max_score,
         feedback = EXCLUDED.feedback,
         taken_at = EXCLUDED.taken_at,
         flagged = EXCLUDED.flagged,
         report = EXCLUDED.report`,
      [
        sid,
        kind,
        week,
        payload.mark ?? 0,
        payload.max_score,
        feedback,
        takenAt,
        payload.exam_id,
        flagged,
        JSON.stringify(storedReport),
      ]
    );
  }

  // The final's display status always tracks the service's latest verdict, so
  // the exams page reflects awaiting-grade / graded / flagged rather than a
  // stale start-time snapshot.
  if (isFinal) {
    await saveFinalExamStatus(sid, webhookToFinalExamStatus(payload));
    const result: StoredFinalResult | null = finalGradeConfirmed
      ? {
          examId: payload.exam_id,
          title: payload.title,
          mark: payload.mark!,
          maxScore: payload.max_score,
          passed: payload.passed,
          submittedAt: takenAt.toISOString(),
          report: payload.report,
        }
      : null;
    const callbackInput = {
      studentId: sid,
      form: payload.final_form === "retake" ? "retake" as const : "primary" as const,
      examId: payload.exam_id,
      submittedAt: takenAt,
      result,
    };
    let outcome;
    try {
      outcome = await recordFinalExamCallback(callbackInput);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("No final-exam policy case")) {
        throw error;
      }
      // Rolling-deploy compatibility for a final launched before policy cases
      // existed. New launches and the scheduler always create the case first.
      await ensurePolicyCaseForCallback(sid);
      outcome = await recordFinalExamCallback(callbackInput);
    }
    if (outcome?.finalized && outcome.result) {
      await enqueueStudentEmailNotification({
        registrationNumber: sid,
        eventId: `final:${outcome.curriculumId}:${outcome.reason}`,
        event: {
          type: "assessment.result",
          assessmentTitle: outcome.result.title,
          score: outcome.result.mark,
          maxScore: outcome.result.maxScore,
          passed: outcome.result.passed,
        },
      });
    }
  } else if (
    payload.integrity_status !== "invalidated" &&
    payload.mark !== null &&
    payload.mark !== undefined &&
    (payload.grading_status === "auto_graded" || payload.grading_status === "graded")
  ) {
    await enqueueStudentEmailNotification({
      registrationNumber: sid,
      eventId: `exam:${payload.exam_id}:graded`,
      event: {
        type: "assessment.result",
        assessmentTitle: payload.title,
        score: payload.mark,
        maxScore: payload.max_score,
        passed: payload.passed,
      },
    });
  }

  await recordExamCallback(payload.exam_id, fingerprint);

  console.log(
    `[exams] result recorded: ${kind}${week ? ` week ${week}` : ""} ` +
      `mark=${payload.mark}/${payload.max_score} flagged=${flagged}`
  );
  return Response.json({ ok: true });
}

async function ensurePolicyCaseForCallback(sid: string): Promise<void> {
  const learner = await queryOne<{ name: string }>(
    `SELECT name FROM "user" WHERE "registrationNumber" = $1`,
    [sid],
  );
  if (!learner) throw new Error("Final callback owner does not exist.");
  const window = await getFinalExamAvailability(sid);
  const link = await ensureExamWorld(sid, learner.name);
  await ensureFinalExamCase({
    studentId: sid,
    curriculumId: link.curriculum_id,
    window,
  });
}

/**
 * Constant-time HMAC-SHA256 verification of the callback, hex-digest compared
 * with timingSafeEqual — never plain string equality. The secret is read from
 * environment configuration (EXAM_CALLBACK_SECRET) and never hardcoded; the
 * raw body is hashed exactly as delivered.
 */
function verifyExamCallbackSignature(rawBody: string, header: string | null): boolean {
  const secret = env.EXAM_CALLBACK_SECRET;
  if (!secret || !header) return false;

  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = header.trim().toLowerCase();

  const left = Buffer.from(computed, "hex");
  const right = Buffer.from(provided, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
