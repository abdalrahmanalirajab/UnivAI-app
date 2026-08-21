import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { now } from "./clock";
import type { AuthorizedSectionBundle } from "./demo-media-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DemoSectionAnswer = {
  activityIndex: number;
  submissionId: string;
  text: string;
  feedback: string;
  citations: Array<Record<string, unknown>>;
};

export type DemoSectionState = {
  exists: boolean;
  state: "intro" | "example" | "guided_task" | "waiting" | "feedback" | "todo_recap" | "completed" | "interrupted" | "failed";
  nodeIndex: number;
  completedNodeIds: string[];
  answers: DemoSectionAnswer[];
  acknowledgedTodos: number[];
  eventVersion: number;
  resumed: boolean;
  attendanceChanged: false;
};

type SessionPayload = {
  packHash: string;
  nodeIndex: number;
  activityIndex: number | null;
  stepIndex: number | null;
  completedNodeIds: string[];
  answers: DemoSectionAnswer[];
  acknowledgedTodos: number[];
  resumeState?: DemoSectionState["state"];
};

type SessionRow = {
  state: DemoSectionState["state"];
  resume_payload: SessionPayload;
  event_version: number;
};

type Action = {
  type: "start" | "advance" | "submit" | "todo_ack" | "leave" | "resume" | "complete";
  idempotencyKey: string;
  eventVersion: number;
  nodeId?: string;
  activityIndex?: number;
  submissionId?: string;
  text?: string;
  todoIndex?: number;
};

export class DemoSectionError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "DemoSectionError";
  }
}

function sessionId(sid: string, bundle: AuthorizedSectionBundle): string {
  return `demo:${sid}:${bundle.section.id}:${bundle.section.payloadHash}`;
}

function cleanState(row: SessionRow | null, nodeCount: number): DemoSectionState {
  if (!row) {
    return { exists: false, state: "intro", nodeIndex: 0, completedNodeIds: [], answers: [], acknowledgedTodos: [], eventVersion: 0, resumed: false, attendanceChanged: false };
  }
  const payload = row.resume_payload ?? {} as SessionPayload;
  return {
    exists: true,
    state: row.state,
    nodeIndex: Math.min(Math.max(0, Number(payload.nodeIndex ?? 0)), nodeCount),
    completedNodeIds: Array.isArray(payload.completedNodeIds) ? payload.completedNodeIds.filter((value): value is string => typeof value === "string").slice(-500) : [],
    answers: Array.isArray(payload.answers) ? payload.answers.filter((value): value is DemoSectionAnswer => Boolean(value && typeof value === "object" && typeof value.text === "string")).slice(-100) : [],
    acknowledgedTodos: Array.isArray(payload.acknowledgedTodos) ? [...new Set(payload.acknowledgedTodos.filter((value): value is number => Number.isInteger(value) && value >= 0))] : [],
    eventVersion: row.event_version,
    resumed: row.state === "interrupted" || row.event_version > 0,
    attendanceChanged: false,
  };
}

export async function getDemoSectionState(sid: string, bundle: AuthorizedSectionBundle): Promise<DemoSectionState> {
  const result = await pool.query<SessionRow>(
    `SELECT state, resume_payload, event_version
       FROM section_session_state
      WHERE session_id = $1 AND tenant_id = $2 AND learner_id = $2
        AND section_pack_id = $3`,
    [sessionId(sid, bundle), sid, bundle.section.id],
  );
  const row = result.rows[0] ?? null;
  if (row && row.resume_payload?.packHash !== bundle.section.payloadHash) throw new DemoSectionError("The saved section belongs to an older pack.", 409, "STALE_SECTION");
  return cleanState(row, bundle.manifest.nodes.length);
}

function normalizeAction(value: unknown): Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DemoSectionError("Invalid section action.", 400, "INVALID_ACTION");
  const body = value as Record<string, unknown>;
  const types = ["start", "advance", "submit", "todo_ack", "leave", "resume", "complete"];
  if (!types.includes(String(body.type)) || typeof body.idempotencyKey !== "string" || !UUID.test(body.idempotencyKey) || !Number.isInteger(body.eventVersion) || Number(body.eventVersion) < 0) {
    throw new DemoSectionError("Invalid section action identity.", 400, "INVALID_ACTION");
  }
  return {
    type: body.type as Action["type"],
    idempotencyKey: body.idempotencyKey,
    eventVersion: Number(body.eventVersion),
    nodeId: typeof body.nodeId === "string" ? body.nodeId : undefined,
    activityIndex: Number.isInteger(body.activityIndex) ? Number(body.activityIndex) : undefined,
    submissionId: typeof body.submissionId === "string" && UUID.test(body.submissionId) ? body.submissionId : undefined,
    text: typeof body.text === "string" ? body.text.trim() : undefined,
    todoIndex: Number.isInteger(body.todoIndex) ? Number(body.todoIndex) : undefined,
  };
}

function actionHash(action: Action): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

async function idempotentResponse(client: PoolClient, owner: string, key: string, hash: string): Promise<DemoSectionState | null> {
  const result = await client.query<{ request_hash: string; response_payload: DemoSectionState }>(
    `SELECT request_hash, response_payload
       FROM core_mutation_idempotency
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [owner, key],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.request_hash !== hash) throw new DemoSectionError("That action ID was reused with different data.", 409, "IDEMPOTENCY_CONFLICT");
  return row.response_payload;
}

async function saveIdempotency(client: PoolClient, owner: string, action: Action, hash: string, response: DemoSectionState, timestamp: Date): Promise<void> {
  await client.query(
    `INSERT INTO core_mutation_idempotency
       (owner_id, idempotency_key, operation, request_hash, response_payload, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [owner, action.idempotencyKey, `demo-section:${action.type}`, hash, JSON.stringify(response), timestamp],
  );
}

function nextState(bundle: AuthorizedSectionBundle, nodeIndex: number): DemoSectionState["state"] {
  if (nodeIndex >= bundle.manifest.nodes.length) return "todo_recap";
  return bundle.manifest.nodes[nodeIndex].state;
}

function payloadFromState(bundle: AuthorizedSectionBundle, state: DemoSectionState, resumeState?: DemoSectionState["state"]): SessionPayload {
  const node = bundle.manifest.nodes[state.nodeIndex];
  return {
    packHash: bundle.section.payloadHash,
    nodeIndex: state.nodeIndex,
    activityIndex: node?.activityIndex ?? null,
    stepIndex: node?.stepIndex ?? null,
    completedNodeIds: state.completedNodeIds,
    answers: state.answers,
    acknowledgedTodos: state.acknowledgedTodos,
    ...(resumeState ? { resumeState } : {}),
  };
}

export async function applyDemoSectionAction(sid: string, bundle: AuthorizedSectionBundle, value: unknown): Promise<DemoSectionState> {
  const action = normalizeAction(value);
  const owner = `demo-section:${sid}:${bundle.section.id}`;
  const hash = actionHash(action);
  const timestamp = await now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await idempotentResponse(client, owner, action.idempotencyKey, hash);
    if (replay) {
      await client.query("COMMIT");
      return replay;
    }
    const locked = await client.query<SessionRow>(
      `SELECT state, resume_payload, event_version
         FROM section_session_state
        WHERE session_id = $1 AND tenant_id = $2 AND learner_id = $2
          AND section_pack_id = $3
        FOR UPDATE`,
      [sessionId(sid, bundle), sid, bundle.section.id],
    );
    let row = locked.rows[0] ?? null;
    if (!row && action.type !== "start") throw new DemoSectionError("Start the section before changing it.", 409, "SECTION_NOT_STARTED");
    if (!row) {
      const initial: DemoSectionState = { exists: true, state: "intro", nodeIndex: 0, completedNodeIds: [], answers: [], acknowledgedTodos: [], eventVersion: 0, resumed: false, attendanceChanged: false };
      await client.query(
        `INSERT INTO section_session_state
           (session_id, schema_version, tenant_id, learner_id, section_pack_id,
            state, resume_payload, event_version, issued_at, expires_at, updated_at)
         VALUES ($1, 'section-session-meta-v1', $2, $2, $3, 'intro', $4::jsonb,
                 0, $5, $5 + INTERVAL '180 days', $5)`,
        [sessionId(sid, bundle), sid, bundle.section.id, JSON.stringify(payloadFromState(bundle, initial)), timestamp],
      );
      row = { state: "intro", resume_payload: payloadFromState(bundle, initial), event_version: 0 };
    }
    if (row.resume_payload.packHash !== bundle.section.payloadHash) throw new DemoSectionError("The section was updated. Refresh to join the latest version.", 409, "STALE_SECTION");
    let state = cleanState(row, bundle.manifest.nodes.length);
    if (action.type === "submit" && action.submissionId && state.answers.some((answer) => answer.submissionId === action.submissionId)) {
      await saveIdempotency(client, owner, action, hash, state, timestamp);
      await client.query("COMMIT");
      return state;
    }
    if (action.type === "todo_ack") {
      const todos = Array.isArray(bundle.section.payload.todos) ? bundle.section.payload.todos : [];
      if (action.todoIndex === undefined || action.todoIndex < 0 || action.todoIndex >= todos.length) throw new DemoSectionError("Unknown TODO item.", 400, "INVALID_TODO");
      if (state.acknowledgedTodos.includes(action.todoIndex)) {
        await saveIdempotency(client, owner, action, hash, state, timestamp);
        await client.query("COMMIT");
        return state;
      }
    }
    if (state.state === "completed") {
      const response = { ...state, resumed: true };
      await saveIdempotency(client, owner, action, hash, response, timestamp);
      await client.query("COMMIT");
      return response;
    }
    if (action.type !== "start" && action.eventVersion !== state.eventVersion) throw new DemoSectionError("Section state changed. Refresh and continue from the saved step.", 409, "STALE_VERSION");

    let persistedState: DemoSectionState["state"] = state.state;
    let resumeState: DemoSectionState["state"] | undefined;
    if (action.type === "start" || action.type === "resume") {
      if (state.state === "interrupted") {
        persistedState = row.resume_payload.resumeState ?? nextState(bundle, state.nodeIndex);
        state = { ...state, state: persistedState, resumed: true };
      }
    } else if (action.type === "advance") {
      const node = bundle.manifest.nodes[state.nodeIndex];
      if (!node || action.nodeId !== node.id) throw new DemoSectionError("The section moved forward. Refresh to continue.", 409, "STALE_NODE");
      if (state.state === "waiting") throw new DemoSectionError("Submit the guided answer before continuing.", 409, "ANSWER_REQUIRED");
      const completedNodeIds = state.completedNodeIds.includes(node.id) ? state.completedNodeIds : [...state.completedNodeIds, node.id];
      if (node.state === "guided_task" && state.state !== "feedback") {
        state = { ...state, state: "waiting", completedNodeIds };
        persistedState = "waiting";
      } else {
        const nodeIndex = state.nodeIndex + 1;
        persistedState = nextState(bundle, nodeIndex);
        state = { ...state, state: persistedState, nodeIndex, completedNodeIds };
      }
    } else if (action.type === "submit") {
      const node = bundle.manifest.nodes[state.nodeIndex];
      if (state.state !== "waiting" || !node || node.state !== "guided_task" || action.activityIndex !== node.activityIndex || !action.submissionId || !action.text) {
        throw new DemoSectionError("Submit a non-empty answer for the current activity.", 400, "INVALID_SUBMISSION");
      }
      const duplicate = state.answers.find((answer) => answer.submissionId === action.submissionId);
      if (!duplicate) {
        state = {
          ...state,
          state: "feedback",
          answers: [...state.answers, {
            activityIndex: action.activityIndex,
            submissionId: action.submissionId,
            text: action.text.slice(0, 4_000),
            feedback: "Your answer was saved with this activity. Review the cited source and continue.",
            citations: node.citations,
          }],
        };
      }
      persistedState = "feedback";
    } else if (action.type === "todo_ack") {
      if (state.state !== "todo_recap" || state.nodeIndex < bundle.manifest.nodes.length) throw new DemoSectionError("Finish the current section before reviewing the tasks.", 409, "TODO_NOT_READY");
      const todoIndex = action.todoIndex;
      if (todoIndex === undefined) throw new DemoSectionError("Unknown TODO item.", 400, "INVALID_TODO");
      state = { ...state, state: "todo_recap", acknowledgedTodos: state.acknowledgedTodos.includes(todoIndex) ? state.acknowledgedTodos : [...state.acknowledgedTodos, todoIndex] };
      persistedState = "todo_recap";
    } else if (action.type === "leave") {
      resumeState = state.state;
      persistedState = "interrupted";
      state = { ...state, state: "interrupted" };
    } else if (action.type === "complete") {
      if (state.nodeIndex < bundle.manifest.nodes.length || state.state !== "todo_recap") throw new DemoSectionError("Finish the current section first.", 409, "SECTION_INCOMPLETE");
      persistedState = "completed";
      state = { ...state, state: "completed" };
    }

    const nextVersion = row.event_version + 1;
    state = { ...state, exists: true, eventVersion: nextVersion, attendanceChanged: false };
    await client.query(
      `UPDATE section_session_state
          SET state = $4, resume_payload = $5::jsonb,
              event_version = $6, updated_at = $7,
              expires_at = GREATEST(expires_at, $7 + INTERVAL '180 days')
        WHERE session_id = $1 AND tenant_id = $2 AND learner_id = $2
          AND section_pack_id = $3`,
      [sessionId(sid, bundle), sid, bundle.section.id, persistedState, JSON.stringify(payloadFromState(bundle, state, resumeState)), nextVersion, timestamp],
    );
    await saveIdempotency(client, owner, action, hash, state, timestamp);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
