import { NextRequest } from "next/server";

import { now } from "@/lib/clock";
import { enqueueReleasedTranscriptNotifications } from "@/lib/notification-outbox";
import { requireAdminApi } from "@/lib/session";
import {
  getTranscripts,
  releaseDueTranscripts,
  reviewTranscript,
  type TranscriptReviewAction,
} from "@/lib/transcripts";

export const dynamic = "force-dynamic";

function validRegistrationNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const registrationNumber = value.trim();
  return /^S-\d{4}-\d{6}$/.test(registrationNumber) ? registrationNumber : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const registrationNumber = validRegistrationNumber(request.nextUrl.searchParams.get("sid"));
  if (!registrationNumber) {
    return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  }
  await releaseDueTranscripts(await now(), registrationNumber);
  return Response.json(
    { transcripts: await getTranscripts(registrationNumber) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: "Review is too large." }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const registrationNumber = validRegistrationNumber(body.registrationNumber);
  const transcriptId = typeof body.transcriptId === "string" ? body.transcriptId.trim() : "";
  const action = body.action as TranscriptReviewAction;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!registrationNumber) return Response.json({ error: "Choose a valid learner." }, { status: 400 });
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(transcriptId)) {
    return Response.json({ error: "Choose a valid transcript." }, { status: 400 });
  }
  if (action !== "hold" && action !== "release") {
    return Response.json({ error: "Choose release or hold." }, { status: 400 });
  }
  if (note.length > 500) {
    return Response.json({ error: "Review note must be 500 characters or fewer." }, { status: 400 });
  }

  try {
    const reviewedAt = await now();
    const transcript = await reviewTranscript({
      actorId: gate.id,
      actorEmail: gate.email,
      registrationNumber,
      transcriptId,
      action,
      note,
      reviewedAt,
    });
    if (!transcript) return Response.json({ error: "Transcript not found." }, { status: 404 });
    if (action === "release") await enqueueReleasedTranscriptNotifications(reviewedAt);
    return Response.json({ transcript });
  } catch (error) {
    if ((error as Error).message === "A released transcript cannot be hidden again.") {
      return Response.json({ error: (error as Error).message }, { status: 409 });
    }
    console.error("Transcript review failed:", error);
    return Response.json({ error: "Could not save the transcript review." }, { status: 500 });
  }
}
