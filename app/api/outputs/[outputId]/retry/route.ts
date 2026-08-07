import path from "node:path";
import { NextRequest } from "next/server";
import { createRetryVersion, markRetryFailed } from "@/lib/feedback";
import { spawnGeneration } from "@/lib/generation";
import { REPO_ROOT } from "@/lib/python";
import { requirePreparedSourceApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ outputId: string }> },
) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const { outputId: rawOutputId } = await context.params;
  const outputId = Number(rawOutputId);
  if (!Number.isInteger(outputId) || outputId < 1) {
    return Response.json({ error: "outputId must be a positive integer." }, { status: 400 });
  }

  const result = await createRetryVersion(gate.studentId, outputId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  try {
    spawnGeneration(
      path.join(REPO_ROOT, "uploads", gate.studentId, result.filename),
      result.output.book_id,
      "full",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start generation.";
    await markRetryFailed(gate.studentId, result.output.id, message);
    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
  return Response.json({ output: result.output }, { status: 201 });
}
