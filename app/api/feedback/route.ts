import { NextRequest } from "next/server";
import { requirePreparedSourceApi } from "@/lib/session";
import {
  getLatestLectureOutput,
  submitFeedback,
  validateFeedback,
  type FeedbackInput,
  type FeedbackRating,
} from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const lectureId = Number(request.nextUrl.searchParams.get("lectureId"));
  if (!Number.isInteger(lectureId) || lectureId < 1) {
    return Response.json({ error: "lectureId must be a positive integer." }, { status: 400 });
  }
  const output = await getLatestLectureOutput(gate.studentId, lectureId);
  return output
    ? Response.json({ output })
    : Response.json({ error: "No recorded output exists for this lecture yet." }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const gate = await requirePreparedSourceApi();
  if (gate instanceof Response) return gate;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { output_id, output_version, trace_id, rating, issue, note } = body as Record<
    string,
    unknown
  >;
  if (
    typeof output_id !== "number" ||
    typeof output_version !== "string" ||
    typeof trace_id !== "string" ||
    typeof rating !== "string" ||
    typeof issue !== "boolean" ||
    (note !== null && note !== undefined && typeof note !== "string")
  ) {
    return Response.json(
      {
        error:
          "output_id must be a number; output_version, trace_id and rating must be strings; issue must be a boolean; note must be a string or null.",
      },
      { status: 400 },
    );
  }

  const input: FeedbackInput = {
    output_id,
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
  return result.ok
    ? Response.json({ feedback: result.feedback }, { status: 201 })
    : Response.json({ error: result.error }, { status: 404 });
}
