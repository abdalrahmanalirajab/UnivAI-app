import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  EXAM_SYSTEM_URL,
  ensureExamWorld,
  getExamStatuses,
  getFinalExamStatus,
  saveFinalExamStatus,
  startExam,
  toFinalExamStatus,
  type FinalExamAttemptView,
} from "@/lib/exams";
import { requireTrustedExamLaunchUrl } from "@/lib/exam-launch";
import { requireLearningActionApi } from "@/lib/session";
import type { SessionUser } from "@/lib/auth-types";

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

  const statuses = await getExamStatuses(gate.studentId);
  return Response.json({
    exams: statuses.map((status) => ({
      ...status,
      opensAt: status.opensAt.toISOString(),
      closesAt: status.closesAt.toISOString(),
    })),
    // The final's last status as reported by the Exam service (session-scoped
    // cache); null when the service has never reported one for this learner.
    final: await getFinalExamStatus(gate.studentId),
  });
}

/**
 * Start an exam: body { kind: "quiz", week: 2 }, { kind: "mid" }, or
 * { kind: "final" }. Quiz and mid go through the app's windowed flow; the
 * final is started by the Exam service, which owns eligibility and the
 * attempt lifecycle. Returns the URL to take it.
 */
export async function POST(request: NextRequest) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;

  const body = await request.json().catch(() => ({}));
  const kind = body?.kind as "quiz" | "mid" | "final" | undefined;
  const week = body?.week ?? null;

  if (kind !== "quiz" && kind !== "mid" && kind !== "final") {
    return Response.json({ error: 'kind must be "quiz", "mid" or "final"' }, { status: 400 });
  }

  if (kind === "final") {
    return startFinalExam(gate);
  }

  try {
    const url = await startExam(
      gate.studentId,
      gate.name,
      kind,
      kind === "quiz" ? Number(week) : null
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
 * Eligibility, publication and the attempt lifecycle are the service's alone:
 * we call it as-is and relay its answer verbatim — including a 403 denial with
 * the service's own reason — without layering any local check on top.
 *
 * Idempotency: this app has no idempotency-key mechanism of its own (existing
 * patterns are DB upserts, see /api/exams/callback). The Exam service defines
 * the `Idempotency-Key` header protocol (its withIdempotency store), so a
 * fresh key is minted server-side per start attempt; a replayed attempt dedupes
 * service-side while a genuinely new attempt always gets a new key.
 */
async function startFinalExam(gate: SessionUser): Promise<Response> {
  try {
    const link = await ensureExamWorld(gate.studentId, gate.name);

    const res = await fetch(`${EXAM_SYSTEM_URL}/api/exams/final/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        student_id: link.student_id,
        curriculum_id: link.curriculum_id,
        // Carried through so the exam system can echo it in the result webhook,
        // routing the grade back to this owner (see /api/exams/callback).
        student_sid: gate.studentId,
      }),
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
    // Remember the status the service reported (session-scoped) so the /exams
    // page can render it. Denials are deliberately NOT persisted: they are
    // relayed to the caller as-is and never made to outlive a later change.
    await saveFinalExamStatus(gate.studentId, toFinalExamStatus(payload as FinalExamAttemptView));
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the final exam.";
    return Response.json({ error: message }, { status: 500 });
  }
}
