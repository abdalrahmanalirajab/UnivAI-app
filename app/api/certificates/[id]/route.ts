import { queryOne } from "@/lib/db";
import { requireVerifiedUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireVerifiedUserApi();
  if (gate instanceof Response) return gate;
  const { id } = await context.params;
  const certificate = await queryOne<{
    filename: string;
    mime_type: string;
    image_data: Buffer;
  }>(
    `SELECT filename, mime_type, image_data FROM certificate_artifacts
      WHERE id = $1 AND student_id = $2`,
    [id, gate.registrationNumber],
  );
  if (!certificate) return Response.json({ error: "Certificate not found." }, { status: 404 });

  const safeFilename = certificate.filename.replace(/[^a-z0-9._-]/gi, "-");
  return new Response(new Uint8Array(certificate.image_data), {
    headers: {
      "Content-Type": certificate.mime_type,
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
