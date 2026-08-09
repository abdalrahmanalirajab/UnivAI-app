import {
  getTranscripts,
  recoverMisclassifiedFinalTranscript,
  upsertCourseTranscript,
} from "@/lib/transcripts";
import { requireVerifiedUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;

  // This runs independently of the list length so a learner who already has
  // an older course transcript can still recover a final misclassified by the
  // previous callback implementation.
  await recoverMisclassifiedFinalTranscript(gate.registrationNumber);

  let transcripts = await getTranscripts(gate.registrationNumber);
  if (transcripts.length === 0) {
    await upsertCourseTranscript(gate.registrationNumber, new Date());
    transcripts = await getTranscripts(gate.registrationNumber);
  }
  return Response.json({ transcripts });
}
