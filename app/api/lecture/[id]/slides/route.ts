import { readSlides } from "@/lib/lectures";
import { getLectureMaterialAccess } from "@/lib/lecture-materials";
import { requireLearningActionApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }
  const access = await getLectureMaterialAccess(gate.registrationNumber, id);
  if (!access) return Response.json({ error: "No such lecture." }, { status: 404 });

  const archiveRequested = new URL(request.url).searchParams.get("mode") === "archive";
  if (!access.available || (archiveRequested && access.mode !== "archive")) {
    const message = access.blockedReason === "makeup_confirmation_required"
      ? "Confirm the one-time make-up lecture before opening its presentation."
      : access.blockedReason === "makeup_completed"
        ? "This one-time make-up lecture is complete and cannot be replayed."
        : access.blockedReason === "makeup_closed"
          ? "This one-time make-up lecture closed before its first join."
          : archiveRequested || access.blockedReason === "not_started"
            ? "The presentation is not available yet."
            : "Your live lecture connection is still being confirmed. The presentation will open automatically.";
    return Response.json(
      { error: message, code: "PRESENTATION_LOCKED", reason: access.blockedReason },
      { status: 403 },
    );
  }

  const deck = await readSlides(gate.registrationNumber, id);
  if (!deck) return Response.json({ error: "Lecture slides are not ready." }, { status: 404 });
  return Response.json({ deck, mode: access.mode });
}
