import { NextRequest } from "next/server";
import { getExamStatuses, startExam } from "@/lib/exams";

export const dynamic = "force-dynamic";

/** All exams with their windows (virtual clock) and results. */
export async function GET() {
  const statuses = await getExamStatuses();
  return Response.json({
    exams: statuses.map((status) => ({
      ...status,
      opensAt: status.opensAt.toISOString(),
      closesAt: status.closesAt.toISOString(),
    })),
  });
}

/** Start an exam: body { kind: "quiz", week: 2 } or { kind: "mid" }. Returns the URL to take it. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind as "quiz" | "mid" | undefined;
  const week = body?.week ?? null;

  if (kind !== "quiz" && kind !== "mid") {
    return Response.json({ error: 'kind must be "quiz" or "mid"' }, { status: 400 });
  }

  try {
    const url = await startExam(kind, kind === "quiz" ? Number(week) : null);
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the exam.";
    return Response.json({ error: message }, { status: 409 });
  }
}
