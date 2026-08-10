import { ensureCertificate } from "@/lib/certificates";
import { requireVerifiedUserApi } from "@/lib/session";
import { getTranscript } from "@/lib/transcripts";
import { releaseDueTranscripts } from "@/lib/transcripts";
import { now } from "@/lib/clock";
import { enforceUserRateLimit } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const limited = await enforceUserRateLimit(gate.id, "account");
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { transcriptId?: string } | null;
  if (!body?.transcriptId) {
    return Response.json({ error: "transcriptId is required." }, { status: 400 });
  }
  await releaseDueTranscripts(await now(), gate.registrationNumber);
  const transcript = await getTranscript(gate.registrationNumber, body.transcriptId);
  if (!transcript) return Response.json({ error: "Transcript not found." }, { status: 404 });
  if (transcript.reviewStatus !== "released") {
    return Response.json(
      { error: "Your transcript is still in its review window." },
      { status: 423 },
    );
  }
  if (!transcript.passed) {
    return Response.json({ error: "Certificates require a passing grade." }, { status: 403 });
  }

  const certificate = await ensureCertificate({
    registrationNumber: gate.registrationNumber,
    recipientName: gate.name,
    transcript,
  });
  return Response.json({
    certificate,
    downloadUrl: `/api/certificates/${certificate.id}`,
  });
}
