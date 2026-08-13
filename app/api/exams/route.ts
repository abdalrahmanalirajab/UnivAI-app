import { NextRequest } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import {
  EXAM_SYSTEM_URL,
  ensureExamWorld,
  getFinalExamAvailability,
  getExamStatuses,
  getFinalExamStatus,
  saveFinalExamStatus,
  syncQuestionBanks,
  startExam,
  toFinalExamStatus,
  type FinalExamAttemptView,
} from "@/lib/exams";
import { now } from "@/lib/clock";
import {
  ensureFinalExamCase,
  getFinalExamCase,
  reconcileFinalExamCase,
  recordFinalExamStart,
  type FinalExamCaseView,
  type FinalExamForm,
} from "@/lib/final-exam-retakes";
import type { FinalExamWindow } from "@/lib/final-exam-policy";
import { env } from "@/lib/env";
import { requireTrustedExamLaunchUrl } from "@/lib/exam-launch";
import { requireLearningActionApi } from "@/lib/session";
import type { SessionUser } from "@/lib/auth-types";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

/** All exams with their windows (virtual clock), results, and the final's service-reported status. */
export async function GET() {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;

  // Deliberately takes no URL parameters. An /exams page URL may carry
  // exam_id or status query parameters (crafted, or appended by a redirect);
  // they are never trusted or even read here. This endpoint derives everything
  // from the authenticated session alone, then re-fetches the exam windows
  // from the exam system and the final's status from this app's own store
  // (populated only by verified callbacks), so the state it returns can never
  // be influenced by anything the URL claims.

  const [statuses, policy] = await Promise.all([
    getExamStatuses(gate.registrationNumber),
    loadFinalPolicy(gate),
  ]);
  return Response.json({
    exams: statuses.map((status) => ({
      ...status,
      opensAt: status.opensAt.toISOString(),
      closesAt: status.closesAt.toISOString(),
    })),
    // The final's last status as reported by the Exam service (session-scoped
    // cache); null when the service has never reported one for this learner.
    final: await getFinalExamStatus(gate.registrationNumber),
    finalWindow: serializeFinalWindow(policy.window),
    finalCase: policy.finalCase,
  });
}

function serializeFinalWindow(window: FinalExamWindow) {
  return {
    ...window,
    opensAt: window.opensAt?.toISOString() ?? null,
    closesAt: window.closesAt?.toISOString() ?? null,
    retakeRequestDeadline: window.retakeRequestDeadline?.toISOString() ?? null,
  };
}

async function loadFinalPolicy(gate: SessionUser): Promise<{
  referenceTime: Date;
  window: FinalExamWindow & { available: boolean };
  finalCase: FinalExamCaseView | null;
  link: Awaited<ReturnType<typeof ensureExamWorld>> | null;
}> {
  const window = await getFinalExamAvailability(gate.registrationNumber);
  const referenceTime = await now();
  if (!window.opensAt || !window.closesAt || !window.retakeRequestDeadline) {
    return { referenceTime, window, finalCase: null, link: null };
  }
  const link = await ensureExamWorld(gate.registrationNumber, gate.name);
  await ensureFinalExamCase({
    studentId: gate.registrationNumber,
    curriculumId: link.curriculum_id,
    window,
  });
  await reconcileFinalExamCase(
    gate.registrationNumber,
    link.curriculum_id,
    referenceTime,
  );
  return {
    referenceTime,
    window,
    finalCase: await getFinalExamCase(
      gate.registrationNumber,
      link.curriculum_id,
      referenceTime,
    ),
    link,
  };
}

/**
 * Start an exam: body { kind: "quiz", week: 2 }, { kind: "mid", week: 4 }, or
 * { kind: "final" }. Quiz and mid go through the app's windowed flow; the
 * final is time-gated here after the last lecture, then started by the Exam
 * service, which owns the attempt lifecycle. Returns the URL to take it.
 */
export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "assessment");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const kind = body?.kind as "quiz" | "mid" | "final" | undefined;
  const week = body?.week ?? null;

  if (kind !== "quiz" && kind !== "mid" && kind !== "final") {
    return Response.json({ error: 'kind must be "quiz", "mid" or "final"' }, { status: 400 });
  }

  if (kind === "final") {
    return startFinalExam(gate);
  }
  const assessmentWeek = Number(week);
  if (!Number.isInteger(assessmentWeek) || assessmentWeek < 1) {
    return Response.json({ error: "quiz and midterm requests require their course week" }, { status: 400 });
  }

  try {
    const url = await startExam(
      gate.registrationNumber,
      gate.name,
      kind,
      assessmentWeek,
    );
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the exam.";
    return Response.json({ error: message }, { status: 409 });
  }
}

/**
 * Start the final exam through the Exam service.
 *
 * The App owns the virtual primary/request/retake windows and administrator
 * approval state. The Exam service independently owns attempt limits, the two
 * immutable papers, answer state and grading. A signed raw-body contract binds
 * the App's authorized form/window to the service launch; service denials are
 * relayed without inventing a different reason.
 *
 * Idempotency: this app has no idempotency-key mechanism of its own (existing
 * patterns are DB upserts, see /api/exams/callback). The Exam service defines
 * the `Idempotency-Key` header protocol (its withIdempotency store), so a
 * fresh key is minted server-side per start attempt; a replayed attempt dedupes
 * service-side while a genuinely new attempt always gets a new key.
 */
async function startFinalExam(gate: SessionUser): Promise<Response> {
  try {
    const policy = await loadFinalPolicy(gate);
    if (!policy.link || !policy.finalCase) {
      return Response.json({ error: "The final exam is not scheduled yet." }, { status: 409 });
    }
    const finalForm: FinalExamForm | null = policy.finalCase.canStartRetake
      ? "retake"
      : policy.finalCase.canStartPrimary
        ? "primary"
        : null;
    if (!finalForm) {
      const error = policy.finalCase.phase === "request-open"
        ? `The primary final has ended. You may request a retake until ${policy.finalCase.requestDeadline}.`
        : policy.finalCase.phase === "retake-waiting"
          ? `Your reserve-form retake opens at ${policy.finalCase.retakeAvailableAt}. Study hard—you’ve got this.`
          : policy.finalCase.phase === "finalized"
            ? "Your final grade has already been set."
            : policy.finalCase.phase === "awaiting-grade"
              ? "Your submitted final is awaiting grading."
              : `No final-exam form is open right now. The primary opens at ${policy.finalCase.primaryOpensAt}.`;
      return Response.json({ error }, { status: 409 });
    }
    if (!env.EXAM_CALLBACK_SECRET) {
      return Response.json({ error: "Trusted exam launch is not configured." }, { status: 503 });
    }

    await syncQuestionBanks(policy.link);
    const accessOpensAt = finalForm === "primary"
      ? policy.finalCase.primaryOpensAt
      : policy.finalCase.retakeAvailableAt!;
    const accessExpiresAt = finalForm === "primary"
      ? policy.finalCase.primaryClosesAt
      : policy.finalCase.retakeClosesAt!;
    const serviceBody = JSON.stringify({
      student_id: policy.link.student_id,
      curriculum_id: policy.link.curriculum_id,
      student_sid: gate.registrationNumber,
      final_form: finalForm,
      authorized_at: policy.referenceTime.toISOString(),
      access_opens_at: accessOpensAt,
      access_expires_at: accessExpiresAt,
      ...(finalForm === "retake" ? { retake_not_before: accessOpensAt } : {}),
    });
    const signature = createHmac("sha256", env.EXAM_CALLBACK_SECRET)
      .update(serviceBody)
      .digest("hex");

    const res = await fetch(`${EXAM_SYSTEM_URL}/api/exams/final/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
        "X-UnivAI-App-Signature": signature,
      },
      body: serviceBody,
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      // The service's own reason (eligibility denial, already attempted, ...)
      // is surfaced as-is — never replaced by a locally computed one.
      const reason =
        payload?.error ?? `The exam system refused to start the final (HTTP ${res.status}).`;
      return Response.json({ error: reason }, { status: res.status });
    }

    if (!payload) {
      return Response.json(
        { error: "The exam system returned an unreadable response." },
        { status: 502 }
      );
    }

    const url = requireTrustedExamLaunchUrl(payload, EXAM_SYSTEM_URL);
    if (typeof payload._id !== "string") {
      return Response.json({ error: "The exam system omitted the exam id." }, { status: 502 });
    }
    await recordFinalExamStart({
      studentId: gate.registrationNumber,
      curriculumId: policy.link.curriculum_id,
      form: finalForm,
      examId: payload._id,
      startedAt: policy.referenceTime,
    });
    // Remember the status the service reported (session-scoped) so the /exams
    // page can render it. Denials are deliberately NOT persisted: they are
    // relayed to the caller as-is and never made to outlive a later change.
    await saveFinalExamStatus(gate.registrationNumber, toFinalExamStatus(payload as FinalExamAttemptView));
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the final exam.";
    return Response.json({ error: message }, { status: 500 });
  }
}
