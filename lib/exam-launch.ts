type ExamLaunchPayload = {
  launch_url?: unknown;
};

const ATTEMPT_TOKEN_MIN_LENGTH = 20;
const ATTEMPT_TOKEN_MAX_LENGTH = 512;

/**
 * Accept only the one-time launch URL issued by our configured Exam service.
 * The attempt token stays in the fragment so it is not sent in HTTP requests.
 */
export function requireTrustedExamLaunchUrl(
  payload: unknown,
  examSystemUrl: string
): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("The exam system returned an invalid launch response.");
  }

  const { launch_url: launchUrl } = payload as ExamLaunchPayload;
  if (typeof launchUrl !== "string" || !launchUrl.trim()) {
    throw new Error("The exam system did not provide a secure launch URL.");
  }

  let expectedOrigin: URL;
  let launch: URL;
  try {
    expectedOrigin = new URL(examSystemUrl);
    launch = new URL(launchUrl);
  } catch {
    throw new Error("The exam system returned an invalid launch URL.");
  }

  if (
    launch.origin !== expectedOrigin.origin ||
    launch.username ||
    launch.password ||
    !/^\/exam\/[^/]+$/.test(launch.pathname)
  ) {
    throw new Error("The exam system returned an untrusted launch URL.");
  }

  const fragment = new URLSearchParams(launch.hash.slice(1));
  const attemptToken = fragment.get("attempt_token");
  if (
    !attemptToken ||
    attemptToken.length < ATTEMPT_TOKEN_MIN_LENGTH ||
    attemptToken.length > ATTEMPT_TOKEN_MAX_LENGTH
  ) {
    throw new Error("The exam system did not provide a valid access token.");
  }

  return launch.toString();
}
