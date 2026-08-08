import { verifyCertificate } from "@/lib/certificate-verification";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const certificate = await verifyCertificate(id);
  if (!certificate) {
    return Response.json({ valid: false, error: "Certificate not found." }, { status: 404 });
  }
  return Response.json({ valid: true, certificate });
}
