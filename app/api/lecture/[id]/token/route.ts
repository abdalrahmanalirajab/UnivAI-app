import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { queryOne } from "@/lib/db";
import { stampJoin } from "@/lib/attendance";
import { getLectures, readScript, BLOCKED_MESSAGE } from "@/lib/lectures";
import { requireLearningActionApi } from "@/lib/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Live session metadata v1 (signed into the LiveKit JWT).
 *
 * The voice worker (UnivAI-live) reads this to know which learner is speaking
 * and to address them by name during live interaction.
 * Everything here is bound to the authenticated learner and the lecture they
 * joined — the client contributes nothing. `spokenName` is the ONLY personal
 * field; email, phone and unrelated profile data never cross into Live.
 *
 * Contract version: 1. The worker fails closed on any other version.
 */
export const LIVE_METADATA_VERSION = 1;

/** Spoken-name cap, in code points (not UTF-16 units), for safe TTS. */
export const SPOKEN_NAME_MAX_LENGTH = 60;

/** How long a minted room token stays valid. Short-lived on purpose. */
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

function liveKitHttpUrl(url: string): string {
  if (url.startsWith("wss://")) return `https://${url.slice(6)}`;
  if (url.startsWith("ws://")) return `http://${url.slice(5)}`;
  return url;
}

async function configureRoom(
  service: RoomServiceClient,
  room: string,
  metadata: LiveRoomMetadataV2,
): Promise<void> {
  const serialized = JSON.stringify(metadata);
  const existing = await service.listRooms([room]);
  if (existing.length > 0) {
    await service.updateRoomMetadata(room, serialized);
    return;
  }
  try {
    await service.createRoom({ name: room, metadata: serialized, emptyTimeout: TOKEN_TTL_SECONDS });
  } catch (error) {
    // A concurrent request may have created the same learner-scoped room after
    // listRooms(). Re-read it; any other failure remains visible and fails closed.
    if ((await service.listRooms([room])).length === 0) throw error;
    await service.updateRoomMetadata(room, serialized);
  }
}

/**
 * Turn a display name into a safe string for the voice worker to speak.
 *
 * - Unicode-normalizes (NFKC), removes control/format/lone-surrogate chars
 *   (zero-width joiners vanish, control chars become separators), collapses
 *   whitespace, trims, and caps the length in code points.
 * - Returns `null` (the generic-phrase fallback) when nothing speakable is
 *   left — an empty name, or a string with no letter or number at all. No
 *   global `STUDENT_NAME` constant is ever consulted.
 */
export function safeSpokenName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const decomposed = raw
    .normalize("NFKC")
    .replace(/[\p{Cc}]/gu, " ") // control chars → separators
    .replace(/[\p{Cf}\p{Cs}]/gu, ""); // zero-width/format/lone surrogates → removed
  const collapsed = decomposed.replace(/\s+/gu, " ").trim();
  if (collapsed.length === 0) return null;

  const codePoints = Array.from(collapsed);
  if (!codePoints.some((char) => /\p{L}|\p{N}/u.test(char))) return null;

  if (codePoints.length > SPOKEN_NAME_MAX_LENGTH) {
    return codePoints
      .slice(0, SPOKEN_NAME_MAX_LENGTH)
      .join("")
      .replace(/\s+$/u, "")
      .replace(/[\p{M}\u{FE0F}]$/u, ""); // never end on a dangling combining mark
  }
  return collapsed;
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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireLearningActionApi();
  if (gate instanceof Response) return gate;
  const sid = gate.registrationNumber;

  const { id } = await context.params;
  const lectureId = id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lectureId)) {
    return Response.json({ error: "No such lecture." }, { status: 404 });
  }

  const lecture = await queryOne<{ id: number; public_id: string; week: number; title: string }>(
    `SELECT id, public_id::text AS public_id, week, title
       FROM lectures WHERE public_id = $1::uuid AND student_id = $2`,
    [lectureId, sid]
  );
  if (!lecture) return Response.json({ error: "No such lecture." }, { status: 404 });

  // The doors close halfway through, and a finished lecture cannot be reopened.
  // The UI disables the button; this makes the rule real.
  const schedule = await getLectures(sid);
  const entry = schedule.find((item) => item.id === lectureId);
  if (entry && !entry.joinable) {
    return Response.json(
      { error: BLOCKED_MESSAGE[entry.blockedReason!], reason: entry.blockedReason },
      { status: 403 }
    );
  }

  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const url = env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return Response.json(
      { error: "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env." },
      { status: 503 }
    );
  }

  // Room name carries the owner so the voice worker loads THIS student's DB
  // artifact and queries RAG under their namespace. Parsed back with
  // /^lecture-(?<sid>.+)-week-(?<week>\d+)$/ in UnivAI-live/worker.py.
  const room = `lecture-${sid}-week-${lecture.week}`;

  // The display name comes ONLY from the authenticated session (the DB-backed
  // Better Auth user record via gate.name) — the request body is never read.
  // planVersion binds the metadata to the learner's current approved plan so
  // Live can invalidate cached personalized audio when the plan changes.
  const spokenName = safeSpokenName(gate.name);
  const [programme, script] = await Promise.all([
    queryOne<{ id: number; plan_version: number }>(
      `SELECT id, plan_version FROM programmes
        WHERE student_id = $1 AND status = 'approved'
        ORDER BY id DESC LIMIT 1`,
      [sid],
    ),
    readScript(sid, lecture.week),
  ]);
  if (!programme || !script) {
    return Response.json(
      { error: "The approved lecture artifact is not ready for Live." },
      { status: 409 },
    );
  }
  const metadata = buildLiveSessionMetadata({
    lectureId,
    week: lecture.week,
    sid,
    planVersion: programme.plan_version,
    spokenName,
  });
  const roomMetadata: LiveRoomMetadataV2 = {
    schema_name: "univai.live.lecture-session",
    schema_version: "2",
    artifact_id: script.lectureId,
    programme_id: String(programme.id),
    course_id: script.lectureId,
    plan_version: programme.plan_version,
    week: lecture.week,
    lecture_id: script.lectureId,
    learner_id: sid,
    nonce: metadata.nonce,
    display_name: spokenName,
  };

  try {
    await configureRoom(
      new RoomServiceClient(liveKitHttpUrl(url), apiKey, apiSecret),
      room,
      roomMetadata,
    );
  } catch (error) {
    console.error("[live] room metadata setup failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Live room setup failed. Please retry." }, { status: 503 });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: sid,
    // The safe spoken name is the participant's display name too: Live speaks
    // this, so the raw (unnormalized) name must never leak into the token.
    name: spokenName ?? undefined,
    ttl: TOKEN_TTL_SECONDS,
    // The voice worker reads this to know which script to speak and to greet
    // the learner by name. Signed by LIVEKIT_API_SECRET inside the JWT.
    metadata: JSON.stringify(metadata),
  });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

  // Attendance is stamped only after the trusted room and token metadata are
  // ready; an infrastructure failure must not mark a learner present.
  const record = await stampJoin(sid, lecture.id);

  return Response.json({
    token: await token.toJwt(),
    url,
    room,
    // Used by the client for learner-scoped session display only.
    registrationNumber: sid,
    lecture: { id: lecture.public_id, week: lecture.week, title: lecture.title },
    attendance: record
      ? { status: record.status, lateMinutes: record.lateMinutes }
      : null,
  });
}
