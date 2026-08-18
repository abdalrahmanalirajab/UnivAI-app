import type { OutputVersion } from "@/lib/feedback";

export type LiveAnswerMetadataResult =
  | { state: "ready"; output: OutputVersion; message: null }
  | { state: "syncing" | "unavailable"; output: null; message: string };

type Request = (input: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

const DEFAULT_RETRY_DELAYS_MS = [0, 250, 500, 1_000, 1_500, 2_000, 2_500] as const;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/**
 * Resolve the optional feedback/source identity written after a spoken answer.
 *
 * The Live worker intentionally sends the answer before its asynchronous
 * ``qa_log`` insert completes. A temporary 404 therefore means "still
 * syncing", never "answer generation failed".
 */
export async function loadLiveAnswerMetadata(
  lectureId: string,
  options: {
    request?: Request;
    pause?: (milliseconds: number) => Promise<void>;
    retryDelaysMs?: readonly number[];
  } = {},
): Promise<LiveAnswerMetadataResult> {
  const request = options.request ?? ((input) => fetch(input));
  const pause = options.pause ?? wait;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  for (const delay of delays) {
    if (delay > 0) await pause(delay);
    try {
      const response = await request(`/api/feedback?lectureId=${lectureId}`);
      const body = await response.json().catch(() => ({})) as {
        output?: OutputVersion;
        error?: string;
      };
      if (response.ok && body.output) {
        return { state: "ready", output: body.output, message: null };
      }
      if (response.status === 404) continue;
      return {
        state: "unavailable",
        output: null,
        message: body.error
          ? `Answer delivered. Source controls are unavailable: ${body.error}`
          : "Answer delivered. Source controls are temporarily unavailable.",
      };
    } catch {
      return {
        state: "unavailable",
        output: null,
        message: "Answer delivered. Source controls are temporarily unavailable.",
      };
    }
  }

  return {
    state: "syncing",
    output: null,
    message: "Answer delivered. Source and feedback controls are still syncing.",
  };
}
