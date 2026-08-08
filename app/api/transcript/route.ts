import { getTranscripts, upsertCourseTranscript } from "@/lib/transcripts";
import { requireVerifiedUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;

  let transcripts = await getTranscripts(gate.studentId);
  if (transcripts.length === 0) {
    await upsertCourseTranscript(gate.studentId, new Date());
    transcripts = await getTranscripts(gate.studentId);
  }
  return Response.json({ transcripts });
}
