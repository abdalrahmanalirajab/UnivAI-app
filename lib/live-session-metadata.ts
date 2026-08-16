import { randomUUID } from "node:crypto";
import { hasOnlyNameLetters, normalizeName } from "./validators";

/** Signed metadata contract shared by the app token issuer and Live worker. */
export const LIVE_METADATA_VERSION = 1;
/** Spoken-name cap, in code points rather than UTF-16 units. */
export const SPOKEN_NAME_MAX_LENGTH = 60;
/** Short-lived room-token lifetime. */
export const TOKEN_TTL_SECONDS = 600;

export type LiveSessionMetadataV1 = {
  v: typeof LIVE_METADATA_VERSION;
  lectureId: string;
  week: number;
  sid: string;
  planVersion: number | null;
  /** Fresh per issuance; lets the worker reject replays and dedupe. */
  nonce: string;
  /** Safe spoken name; `null` means "use the generic phrase" in Live. */
  spokenName: string | null;
};

export type LiveRoomMetadataV2 = {
  schema_name: "univai.live.lecture-session";
  schema_version: "2";
  artifact_id: string;
  programme_id: string;
  course_id: string;
  plan_version: number;
  week: number;
  lecture_id: string;
  learner_id: string;
  nonce: string;
  display_name: string | null;
};

/** Normalize a display name into text that is safe for the voice worker. */
export function safeSpokenName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeName(raw);
  if (!hasOnlyNameLetters(normalized)) return null;

  const codePoints = Array.from(normalized);
  if (codePoints.length > SPOKEN_NAME_MAX_LENGTH) {
    return codePoints
      .slice(0, SPOKEN_NAME_MAX_LENGTH)
      .join("")
      .replace(/\s+$/u, "")
      .replace(/\p{M}+$/u, "");
  }
  return normalized;
}

export function buildLiveSessionMetadata(input: {
  lectureId: string;
  week: number;
  sid: string;
  planVersion: number | null;
  spokenName: string | null;
}): LiveSessionMetadataV1 {
  return {
    v: LIVE_METADATA_VERSION,
    lectureId: input.lectureId,
    week: input.week,
    sid: input.sid,
    planVersion: input.planVersion,
    nonce: randomUUID(),
    spokenName: input.spokenName,
  };
}
