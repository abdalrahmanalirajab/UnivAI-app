import { ensureCertificate } from "@/lib/certificates";
import { requireVerifiedUserApi } from "@/lib/session";
import { getTranscript } from "@/lib/transcripts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;

  const body = (await request.json().catch(() => null)) as { transcriptId?: string } | null;
  if (!body?.transcriptId) {
    return Response.json({ error: "transcriptId is required." }, { status: 400 });
  }
  const transcript = await getTranscript(gate.studentId, body.transcriptId);
  if (!transcript) return Response.json({ error: "Transcript not found." }, { status: 404 });
  if (!transcript.passed) {
    return Response.json({ error: "Certificates require a passing grade." }, { status: 403 });
  }

  const certificate = await ensureCertificate({
    studentId: gate.studentId,
    recipientName: gate.name,
    transcript,
  });
  return Response.json({
    certificate,
    downloadUrl: `/api/certificates/${certificate.id}`,
  });
}
