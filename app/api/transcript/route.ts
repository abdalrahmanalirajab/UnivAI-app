import { getTranscripts, upsertCourseTranscript } from "@/lib/transcripts";
import { requireVerifiedUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;

  let transcripts = await getTranscripts(gate.registrationNumber);
  if (transcripts.length === 0) {
    await upsertCourseTranscript(gate.registrationNumber, new Date());
    transcripts = await getTranscripts(gate.registrationNumber);
  }
  return Response.json({ transcripts });
}
