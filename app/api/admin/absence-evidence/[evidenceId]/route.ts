import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ evidenceId: string }> },
) {
  const gate = await requireAdminApi();
  if (gate instanceof Response) return gate;
  const { evidenceId } = await params;
  if (!UUID.test(evidenceId)) return Response.json({ error: "Evidence not found." }, { status: 404 });
  const evidence = await queryOne<{ mime_type: string; image_data: Buffer }>(
    `SELECT mime_type, image_data FROM absence_evidence
      WHERE id = $1::uuid AND expires_at > CURRENT_TIMESTAMP`,
    [evidenceId],
  );
  if (!evidence) return Response.json({ error: "Evidence not found." }, { status: 404 });
  return new Response(new Uint8Array(evidence.image_data), {
    headers: {
      "Content-Type": evidence.mime_type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox",
    },
  });
}
