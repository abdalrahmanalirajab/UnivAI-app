import { readSlides } from "@/lib/lectures";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }
  const deck = await readSlides(gate.studentId, id);
  if (!deck) return Response.json({ error: "Lecture slides are not ready." }, { status: 404 });
  return Response.json({ deck });
}
