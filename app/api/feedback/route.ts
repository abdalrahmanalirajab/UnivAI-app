import { NextRequest } from "next/server";
import { requirePreparedSourceApi } from "@/lib/session";
import { submitFeedback, validateFeedback, type FeedbackInput, type FeedbackRating } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/**
 * Submit feedback on a generated output: thumbs up/down, an issue flag, and
 * an optional note, linked to the output's output_version and trace_id.
 * The body is schema-validated here (types) and again in lib/feedback.ts
 * (format), matching the pattern in lib/collections.ts.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { output_version, trace_id, rating, issue, note } = body as Record<string, unknown>;

  if (
    typeof output_version !== "string" ||
    typeof trace_id !== "string" ||
    typeof rating !== "string" ||
    typeof issue !== "boolean" ||
    (note !== null && note !== undefined && typeof note !== "string")
  ) {
    return Response.json(
      { error: "output_version, trace_id and rating must be strings; issue must be a boolean; note must be a string or null." },
      { status: 400 }
    );
  }

  const input: FeedbackInput = {
    output_version,
    trace_id,
    rating: rating as FeedbackRating,
    issue,
    note: note ?? null,
  };

  const validationMessage = validateFeedback(input);
  if (validationMessage) {
    return Response.json({ error: validationMessage }, { status: 400 });
  }

  const result = await submitFeedback(gate.studentId, input);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ feedback: result.feedback });
}
