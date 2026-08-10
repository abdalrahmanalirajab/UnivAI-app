import {
  getStudentTranscriptAccess,
  getTranscripts,
  recoverMisclassifiedFinalTranscript,
  upsertCourseTranscript,
} from "@/lib/transcripts";
import { requireVerifiedUserApi } from "@/lib/session";
import { now } from "@/lib/clock";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const currentTime = await now();

  // This runs independently of the list length so a learner who already has
  // an older course transcript can still recover a final misclassified by the
  // previous callback implementation.
  await recoverMisclassifiedFinalTranscript(gate.registrationNumber);

  const transcripts = await getTranscripts(gate.registrationNumber);
  if (transcripts.length === 0) {
    await upsertCourseTranscript(gate.registrationNumber, currentTime);
  }
  return Response.json(
    await getStudentTranscriptAccess(gate.registrationNumber, currentTime),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
