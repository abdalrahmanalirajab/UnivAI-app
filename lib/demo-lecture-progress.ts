import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { now } from "./clock";
import { BLOCKED_MESSAGE, getLectures } from "./lectures";
import { getLectureMakeupAccess } from "./lecture-makeup";
import type { AuthorizedLectureBundle } from "./demo-media-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const GRACE_MINUTES = 5;
const SESSION_STALE_MS = 15_000;

export type DemoLectureAction = {
  type: "start" | "checkpoint" | "heartbeat" | "pause" | "leave" | "complete";
  eventId: string;
  sessionId: string;
  scriptDigest: string;
  currentCue: number;
  furthestCompletedCue: number;
  checkpointVersion: number;
  attendedSeconds?: number;
};

export type DemoLectureCheckpoint = {
  admitted: boolean;
  completed: boolean;
  currentCue: number;
  furthestCompletedCue: number;
  totalCues: number;
  checkpointVersion: number;
  replayFrom: number;
  isResume: boolean;
};

type AttendanceRow = {
  joined_at: Date;
  completed_at: Date | null;
  attended_seconds: number | string;
  is_connected: boolean;
  presence_last_seen_at: Date | null;
  last_sentence_index: number;
  total_sentences: number;
  demo_media_script_digest: string | null;
  demo_media_artifact_id: string | null;
  demo_media_plan_version: number | null;
  demo_media_current_cue: number;
  demo_media_checkpoint_version: number;
  demo_media_active_session_id: string | null;
  demo_media_last_heartbeat_at: Date | null;
};

export class DemoLectureSessionError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "DemoLectureSessionError";
  }
}

export async function requireDemoLectureAccess(sid: string, lectureId: string): Promise<void> {
  const [schedule, makeup] = await Promise.all([
    getLectures(sid),
    getLectureMakeupAccess(sid, lectureId),
  ]);
  const entry = schedule.find((candidate) => candidate.id === lectureId);
  if (!entry) throw new DemoLectureSessionError("No such lecture.", 404, "LECTURE_NOT_FOUND");
  if (makeup?.state === "ready") {
    throw new DemoLectureSessionError("Confirm the one-time make-up start before joining this lecture.", 409, "MAKEUP_CONFIRMATION_REQUIRED");
  }
  if (makeup?.state === "completed" || makeup?.state === "expired") {
    throw new DemoLectureSessionError(
      makeup.state === "completed" ? "This one-time make-up lecture is already complete." : "This one-time make-up lecture is no longer available.",
      403,
      makeup.state === "completed" ? "MAKEUP_COMPLETED" : "MAKEUP_CLOSED",
    );
  }
  if (!entry.joinable && makeup?.state !== "active") {
    throw new DemoLectureSessionError(BLOCKED_MESSAGE[entry.blockedReason!], 403, String(entry.blockedReason).toUpperCase());
  }
}

export function checkpointFromBundle(bundle: AuthorizedLectureBundle): DemoLectureCheckpoint {
  const total = bundle.manifest.cues.length;
  const furthest = Math.min(total, Math.max(0, bundle.row.last_sentence_index ?? 0));
  const staleIdentity = furthest > 0 && (
    (bundle.row.demo_media_script_digest !== null && bundle.row.demo_media_script_digest !== bundle.manifest.scriptDigest) ||
    (bundle.row.demo_media_artifact_id !== null && bundle.row.demo_media_artifact_id !== bundle.manifest.artifactId) ||
    (bundle.row.demo_media_plan_version !== null && bundle.row.demo_media_plan_version !== bundle.manifest.planVersion)
  );
  if (staleIdentity) throw new DemoLectureSessionError("Your saved place belongs to an older version of this lecture. Refresh to continue.", 409, "STALE_CHECKPOINT");
  const current = Math.min(Math.max(0, bundle.row.demo_media_current_cue ?? furthest), Math.max(0, total - 1));
  return {
    admitted: Boolean(bundle.row.joined_at),
    completed: Boolean(bundle.row.completed_at),
    currentCue: current,
    furthestCompletedCue: furthest,
    totalCues: total,
    checkpointVersion: bundle.row.demo_media_checkpoint_version ?? 0,
    replayFrom: Math.max(0, furthest - 3),
    isResume: Boolean(bundle.row.joined_at && !bundle.row.completed_at && furthest > 0),
  };
}

function normalizeAction(value: unknown, totalCues: number): DemoLectureAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DemoLectureSessionError("Invalid lecture event.", 400, "INVALID_EVENT");
  const body = value as Record<string, unknown>;
  const allowed = ["start", "checkpoint", "heartbeat", "pause", "leave", "complete"];
  if (!allowed.includes(String(body.type)) || typeof body.eventId !== "string" || !UUID.test(body.eventId) || typeof body.sessionId !== "string" || !UUID.test(body.sessionId) || typeof body.scriptDigest !== "string" || !SHA256.test(body.scriptDigest)) {
    throw new DemoLectureSessionError("Invalid lecture event identity.", 400, "INVALID_EVENT");
  }
  const bounded = (field: string, maximum: number) => {
    const number = body[field];
    if (!Number.isInteger(number) || Number(number) < 0 || Number(number) > maximum) throw new DemoLectureSessionError(`Invalid ${field}.`, 400, "INVALID_EVENT");
    return Number(number);
  };
  const attendedSeconds = body.attendedSeconds === undefined ? 0 : Number(body.attendedSeconds);
  if (!Number.isFinite(attendedSeconds) || attendedSeconds < 0 || attendedSeconds > 15) {
    throw new DemoLectureSessionError("Invalid attended time.", 400, "INVALID_ATTENDED_TIME");
  }
  return {
    type: body.type as DemoLectureAction["type"],
    eventId: body.eventId,
    sessionId: body.sessionId,
    scriptDigest: body.scriptDigest,
    currentCue: bounded("currentCue", Math.max(0, totalCues - 1)),
    furthestCompletedCue: bounded("furthestCompletedCue", totalCues),
    checkpointVersion: bounded("checkpointVersion", 2_147_483_647),
    attendedSeconds,
  };
}

function requestHash(action: DemoLectureAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

async function attendance(client: PoolClient, sid: string, lectureId: number): Promise<AttendanceRow | null> {
  const result = await client.query<AttendanceRow>(
    `SELECT joined_at, completed_at, attended_seconds, is_connected,
            presence_last_seen_at, last_sentence_index, total_sentences,
            demo_media_script_digest, demo_media_current_cue,
            demo_media_checkpoint_version,
            demo_media_active_session_id::text AS demo_media_active_session_id,
            demo_media_last_heartbeat_at,
            demo_media_artifact_id::text AS demo_media_artifact_id,
            demo_media_plan_version
       FROM attendance
      WHERE student_id = $1 AND lecture_id = $2
      FOR UPDATE`,
    [sid, lectureId],
  );
  return result.rows[0] ?? null;
}

function state(row: AttendanceRow, totalCues: number): DemoLectureCheckpoint {
  const furthest = Math.min(totalCues, Math.max(0, row.last_sentence_index));
  return {
    admitted: true,
    completed: Boolean(row.completed_at),
    currentCue: Math.min(Math.max(0, row.demo_media_current_cue), Math.max(0, totalCues - 1)),
    furthestCompletedCue: furthest,
    totalCues,
    checkpointVersion: row.demo_media_checkpoint_version,
    replayFrom: Math.max(0, furthest - 3),
    isResume: !row.completed_at && furthest > 0,
  };
}

async function replayedEvent(client: PoolClient, sid: string, lectureId: number, eventId: string, hash: string): Promise<DemoLectureCheckpoint | null> {
  const result = await client.query<{ request_hash: string; response_payload: DemoLectureCheckpoint }>(
    `SELECT request_hash, response_payload
       FROM demo_media_lecture_events
      WHERE student_id = $1 AND lecture_id = $2 AND event_id = $3::uuid`,
    [sid, lectureId, eventId],
  );
  const saved = result.rows[0];
  if (!saved) return null;
  if (saved.request_hash !== hash) throw new DemoLectureSessionError("That event ID was already used with different data.", 409, "IDEMPOTENCY_CONFLICT");
  return saved.response_payload;
}

async function saveEvent(client: PoolClient, sid: string, lectureId: number, action: DemoLectureAction, hash: string, response: DemoLectureCheckpoint): Promise<void> {
  await client.query(
    `INSERT INTO demo_media_lecture_events
       (student_id, lecture_id, event_id, session_id, event_type, request_hash, response_payload)
     VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
    [sid, lectureId, action.eventId, action.sessionId, action.type, hash, JSON.stringify(response)],
  );
}

export async function applyDemoLectureAction(
  sid: string,
  bundle: AuthorizedLectureBundle,
  rawAction: unknown,
): Promise<DemoLectureCheckpoint> {
  const totalCues = bundle.manifest.cues.length;
  const action = normalizeAction(rawAction, totalCues);
  if (action.scriptDigest !== bundle.manifest.scriptDigest) throw new DemoLectureSessionError("The lecture was updated. Refresh to join the latest version.", 409, "STALE_ARTIFACT");
  if (action.type === "start") await requireDemoLectureAccess(sid, bundle.row.public_id);
  const eventHash = requestHash(action);
  const virtualNow = await now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await replayedEvent(client, sid, bundle.row.internal_id, action.eventId, eventHash);
    if (replay) {
      await client.query("COMMIT");
      return replay;
    }

    let row = await attendance(client, sid, bundle.row.internal_id);
    if (action.type === "start" && !row) {
      const makeup = await getLectureMakeupAccess(sid, bundle.row.public_id);
      const effectiveStart = makeup?.state === "active" && makeup.startedAt ? makeup.startedAt : new Date(bundle.row.starts_at);
      const lateMinutes = Math.max(0, Math.floor((virtualNow.getTime() - effectiveStart.getTime()) / 60_000));
      await client.query(
        `INSERT INTO attendance
           (student_id, lecture_id, joined_at, status, late_minutes,
            total_sentences, last_sentence_index, is_connected,
            presence_last_seen_at, last_connected_at,
            demo_media_script_digest, demo_media_current_cue,
            demo_media_checkpoint_version, demo_media_active_session_id,
            demo_media_last_heartbeat_at, demo_media_artifact_id,
            demo_media_plan_version)
         VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE, $3, $3, $7, 0, 1, $8::uuid, $3, $9::uuid, $10)
         ON CONFLICT (student_id, lecture_id) DO NOTHING`,
        [sid, bundle.row.internal_id, virtualNow, lateMinutes > GRACE_MINUTES ? "late" : "on_time", lateMinutes > GRACE_MINUTES ? lateMinutes : 0, totalCues, bundle.manifest.scriptDigest, action.sessionId, bundle.manifest.artifactId, bundle.manifest.planVersion],
      );
      row = await attendance(client, sid, bundle.row.internal_id);
    }
    if (!row) throw new DemoLectureSessionError("Start the lecture before saving playback.", 409, "NOT_STARTED");
    if (row.completed_at) throw new DemoLectureSessionError("This lecture is already complete.", 409, "ALREADY_COMPLETED");
    if (row.last_sentence_index > 0 && row.demo_media_script_digest && row.demo_media_script_digest !== bundle.manifest.scriptDigest) {
      throw new DemoLectureSessionError("Your saved place belongs to an older version of this lecture. Refresh to continue.", 409, "STALE_CHECKPOINT");
    }
    if (row.last_sentence_index > 0 && ((row.demo_media_artifact_id && row.demo_media_artifact_id !== bundle.manifest.artifactId) || (row.demo_media_plan_version && row.demo_media_plan_version !== bundle.manifest.planVersion))) {
      throw new DemoLectureSessionError("Your saved place belongs to an older version of this lecture. Refresh to continue.", 409, "STALE_CHECKPOINT");
    }
    if (row.total_sentences > 0 && row.total_sentences !== totalCues && row.last_sentence_index > 0) {
      throw new DemoLectureSessionError("Your saved place belongs to an older version of this lecture. Refresh to continue.", 409, "STALE_CHECKPOINT");
    }

    if (action.type === "start") {
      const lastSeen = row.presence_last_seen_at ? new Date(row.presence_last_seen_at).getTime() : 0;
      const sameActiveSession = row.is_connected && row.demo_media_active_session_id === action.sessionId && Math.abs(virtualNow.getTime() - lastSeen) <= SESSION_STALE_MS;
      if (sameActiveSession) {
        const response = state(row, totalCues);
        await saveEvent(client, sid, bundle.row.internal_id, action, eventHash, response);
        await client.query("COMMIT");
        return response;
      }
      await client.query(
        `UPDATE attendance
            SET total_sentences = $3,
                demo_media_script_digest = $4,
                demo_media_artifact_id = $5::uuid,
                demo_media_plan_version = $6,
                demo_media_current_cue = CASE WHEN last_sentence_index = 0 THEN 0 ELSE demo_media_current_cue END,
                demo_media_active_session_id = $7::uuid,
                is_connected = TRUE,
                presence_last_seen_at = $8,
                last_connected_at = $8,
                demo_media_last_heartbeat_at = $8,
                demo_media_checkpoint_version = demo_media_checkpoint_version + 1
          WHERE student_id = $1 AND lecture_id = $2`,
        [sid, bundle.row.internal_id, totalCues, bundle.manifest.scriptDigest, bundle.manifest.artifactId, bundle.manifest.planVersion, action.sessionId, virtualNow],
      );
    } else {
      if (row.demo_media_active_session_id !== action.sessionId) {
        throw new DemoLectureSessionError("This lecture session is no longer active. Refresh to rejoin.", 409, "STALE_SESSION");
      }
      if (action.checkpointVersion !== row.demo_media_checkpoint_version) {
        throw new DemoLectureSessionError("Your lecture state changed. Refresh to continue.", 409, "STALE_VERSION");
      }
      if (action.type === "checkpoint" && action.furthestCompletedCue > row.last_sentence_index + 1) {
        throw new DemoLectureSessionError("Lecture progress cannot skip ahead.", 409, "COVERAGE_GAP");
      }
      const heard = action.type === "checkpoint" ? Math.max(row.last_sentence_index, action.furthestCompletedCue) : row.last_sentence_index;
      const safeCurrentCue = Math.min(action.currentCue, heard, Math.max(0, totalCues - 1));
      const accountsAttendedTime = action.type === "heartbeat" || action.type === "pause" || action.type === "leave" || action.type === "complete";
      const lastAccountingAt = row.demo_media_last_heartbeat_at ?? row.presence_last_seen_at;
      const elapsedSinceAccounting = lastAccountingAt
        ? Math.max(0, Math.min(15, (virtualNow.getTime() - new Date(lastAccountingAt).getTime()) / 1_000))
        : 0;
      const attended = accountsAttendedTime
        ? Math.min(action.attendedSeconds ?? 0, elapsedSinceAccounting)
        : 0;
      if (action.type === "leave") {
        await client.query(
          `UPDATE attendance
              SET attended_seconds = attended_seconds + CASE WHEN is_connected THEN $3 ELSE 0 END,
                  is_connected = FALSE,
                  presence_last_seen_at = $4,
                  last_disconnected_at = CASE WHEN is_connected THEN $4 ELSE last_disconnected_at END,
                  disconnect_count = disconnect_count + CASE WHEN is_connected THEN 1 ELSE 0 END,
                  demo_media_current_cue = $5,
                  demo_media_active_session_id = NULL,
                  demo_media_last_heartbeat_at = $4,
                  demo_media_checkpoint_version = demo_media_checkpoint_version + 1
            WHERE student_id = $1 AND lecture_id = $2`,
          [sid, bundle.row.internal_id, attended, virtualNow, safeCurrentCue],
        );
      } else if (action.type === "complete") {
        if (row.last_sentence_index < totalCues) throw new DemoLectureSessionError("The final sentence has not finished yet.", 409, "INCOMPLETE_COVERAGE");
        await client.query(
          `UPDATE attendance
              SET attended_seconds = attended_seconds + $3,
                  completed_at = COALESCE(completed_at, $4),
                  is_connected = FALSE,
                  presence_last_seen_at = $4,
                  last_disconnected_at = CASE WHEN is_connected THEN $4 ELSE last_disconnected_at END,
                  disconnect_count = disconnect_count + CASE WHEN is_connected THEN 1 ELSE 0 END,
                  last_sentence_index = total_sentences,
                  demo_media_current_cue = GREATEST(total_sentences - 1, 0),
                  demo_media_active_session_id = NULL,
                  demo_media_last_heartbeat_at = $4,
                  demo_media_checkpoint_version = demo_media_checkpoint_version + 1
            WHERE student_id = $1 AND lecture_id = $2`,
          [sid, bundle.row.internal_id, attended, virtualNow],
        );
      } else {
        await client.query(
          `UPDATE attendance
              SET attended_seconds = attended_seconds + $3,
                  presence_last_seen_at = $4,
                  demo_media_last_heartbeat_at = CASE WHEN $7 THEN $4 ELSE demo_media_last_heartbeat_at END,
                  demo_media_current_cue = $5,
                  last_sentence_index = $6,
                  demo_media_checkpoint_version = demo_media_checkpoint_version + 1
            WHERE student_id = $1 AND lecture_id = $2`,
          [sid, bundle.row.internal_id, attended, virtualNow, safeCurrentCue, heard, action.type === "heartbeat" || action.type === "pause"],
        );
      }
    }
    row = await attendance(client, sid, bundle.row.internal_id);
    if (!row) throw new DemoLectureSessionError("Lecture attendance could not be saved.", 500, "PERSISTENCE_FAILED");
    const response = state(row, totalCues);
    await saveEvent(client, sid, bundle.row.internal_id, action, eventHash, response);
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
