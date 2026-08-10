import type { PoolClient } from "pg";

import { pool, query, queryOne } from "./db";

export const RATE_LIMIT_DEFAULTS = {
  upload: { label: "Uploads", maxRequests: 8, windowSeconds: 3600 },
  generation: { label: "Course generation", maxRequests: 4, windowSeconds: 3600 },
  assessment: { label: "Assessment actions", maxRequests: 30, windowSeconds: 60 },
  live: { label: "Live lecture access", maxRequests: 30, windowSeconds: 60 },
  feedback: { label: "Feedback and retries", maxRequests: 20, windowSeconds: 60 },
  account: { label: "Account and billing actions", maxRequests: 20, windowSeconds: 600 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_DEFAULTS;

export type AdminRateLimitPolicy = {
  scope: RateLimitScope;
  label: string;
  enabled: boolean;
  blocked: boolean;
  maxRequests: number;
  windowSeconds: number;
  requestCount: number;
  overridden: boolean;
};

type ConsumeRow = {
  enabled: boolean;
  blocked: boolean;
  max_requests: number;
  window_seconds: number;
  request_count: number;
  retry_after_seconds: number;
};

function isScope(value: unknown): value is RateLimitScope {
  return typeof value === "string" && value in RATE_LIMIT_DEFAULTS;
}

/**
 * Atomically consumes one fixed-window request for an authenticated UUID.
 * Abuse controls intentionally use real database time, never the academic
 * virtual clock an administrator can advance for lectures.
 */
export async function enforceUserRateLimit(
  userId: string,
  scope: RateLimitScope,
): Promise<Response | null> {
  const defaults = RATE_LIMIT_DEFAULTS[scope];
  try {
    const row = await queryOne<ConsumeRow>(
      `WITH effective AS (
         SELECT COALESCE(policy.enabled, true) AS enabled,
                COALESCE(policy.blocked, false) AS blocked,
                COALESCE(policy.max_requests, $3::integer) AS max_requests,
                COALESCE(policy.window_seconds, $4::integer) AS window_seconds
           FROM "user" AS learner
           LEFT JOIN user_rate_limit_policies AS policy
             ON policy.user_id = learner."id" AND policy.scope = $2
          WHERE learner."id" = $1::uuid
       ), bucket AS (
         SELECT effective.*,
                to_timestamp(
                  floor(extract(epoch FROM clock_timestamp()) / effective.window_seconds)
                  * effective.window_seconds
                ) AS bucket_start
           FROM effective
       ), consumed AS (
         INSERT INTO user_rate_limit_usage
           (user_id, scope, bucket_start, request_count, updated_at)
         SELECT $1::uuid, $2, bucket.bucket_start, 1, CURRENT_TIMESTAMP
           FROM bucket
          WHERE bucket.enabled = true AND bucket.blocked = false
         ON CONFLICT (user_id, scope, bucket_start) DO UPDATE
           SET request_count = user_rate_limit_usage.request_count + 1,
               updated_at = CURRENT_TIMESTAMP
         RETURNING request_count, bucket_start
       )
       SELECT bucket.enabled, bucket.blocked, bucket.max_requests,
              bucket.window_seconds, COALESCE(consumed.request_count, 0) AS request_count,
              CASE
                WHEN bucket.blocked THEN bucket.window_seconds
                ELSE GREATEST(
                  1,
                  CEIL(EXTRACT(EPOCH FROM (
                    bucket.bucket_start
                    + bucket.window_seconds * INTERVAL '1 second'
                    - clock_timestamp()
                  )))::integer
                )
              END AS retry_after_seconds
         FROM bucket
         LEFT JOIN consumed ON true`,
      [userId, scope, defaults.maxRequests, defaults.windowSeconds],
    );

    if (!row) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (!row.blocked && !row.enabled) return null;
    if (!row.blocked && row.request_count <= row.max_requests) return null;

    const retryAfter = Math.max(1, Math.trunc(row.retry_after_seconds));
    return Response.json(
      { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    const label = error instanceof Error ? error.name : "UnknownError";
    console.error(`[rate-limit] enforcement unavailable (${label})`);
    return Response.json(
      { error: "Request protection is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
}

type AdminPolicyRow = {
  scope: RateLimitScope;
  enabled: boolean;
  blocked: boolean;
  max_requests: number;
  window_seconds: number;
  request_count: number;
  overridden: boolean;
};

function defaultRows() {
  return Object.entries(RATE_LIMIT_DEFAULTS).map(([scope, policy]) => ({
    scope,
    max_requests: policy.maxRequests,
    window_seconds: policy.windowSeconds,
  }));
}

export async function getAdminRateLimitPolicies(registrationNumber: string): Promise<{
  learner: { id: string; registrationNumber: string; name: string };
  policies: AdminRateLimitPolicy[];
} | null> {
  const learner = await queryOne<{ id: string; registrationNumber: string; name: string }>(
    `SELECT "id"::text AS id, "registrationNumber", name
       FROM "user" WHERE "registrationNumber" = $1`,
    [registrationNumber],
  );
  if (!learner) return null;

  const rows = await query<AdminPolicyRow>(
    `WITH defaults AS (
       SELECT scope, max_requests, window_seconds
         FROM jsonb_to_recordset($2::jsonb)
           AS defaults(scope text, max_requests integer, window_seconds integer)
     )
     SELECT defaults.scope,
            COALESCE(policy.enabled, true) AS enabled,
            COALESCE(policy.blocked, false) AS blocked,
            COALESCE(policy.max_requests, defaults.max_requests) AS max_requests,
            COALESCE(policy.window_seconds, defaults.window_seconds) AS window_seconds,
            COALESCE(usage.request_count, 0) AS request_count,
            (policy.user_id IS NOT NULL) AS overridden
       FROM defaults
       LEFT JOIN user_rate_limit_policies AS policy
         ON policy.user_id = $1::uuid AND policy.scope = defaults.scope
       LEFT JOIN LATERAL (
         SELECT request_count
           FROM user_rate_limit_usage
          WHERE user_id = $1::uuid
            AND scope = defaults.scope
            AND bucket_start = to_timestamp(
              floor(
                extract(epoch FROM clock_timestamp())
                / COALESCE(policy.window_seconds, defaults.window_seconds)
              ) * COALESCE(policy.window_seconds, defaults.window_seconds)
            )
          LIMIT 1
       ) AS usage ON true
      ORDER BY defaults.scope`,
    [learner.id, JSON.stringify(defaultRows())],
  );

  return {
    learner,
    policies: rows.map((row) => ({
      scope: row.scope,
      label: RATE_LIMIT_DEFAULTS[row.scope].label,
      enabled: row.enabled,
      blocked: row.blocked,
      maxRequests: row.max_requests,
      windowSeconds: row.window_seconds,
      requestCount: row.request_count,
      overridden: row.overridden,
    })),
  };
}

export function parseAdminRateLimitPolicy(value: unknown): {
  registrationNumber: string;
  scope: RateLimitScope;
  enabled: boolean;
  blocked: boolean;
  maxRequests: number;
  windowSeconds: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Send a rate-limit policy object.");
  }
  const body = value as Record<string, unknown>;
  const registrationNumber = typeof body.registrationNumber === "string"
    ? body.registrationNumber.trim()
    : "";
  if (!/^S-\d{4}-\d{6}$/.test(registrationNumber)) {
    throw new Error("Choose a valid learner.");
  }
  if (!isScope(body.scope)) throw new Error("Choose a valid rate-limit area.");
  if (typeof body.enabled !== "boolean" || typeof body.blocked !== "boolean") {
    throw new Error("enabled and blocked must be boolean values.");
  }
  const maxRequests = Number(body.maxRequests);
  const windowSeconds = Number(body.windowSeconds);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10000) {
    throw new Error("maxRequests must be from 1 to 10000.");
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) {
    throw new Error("windowSeconds must be from 1 to 86400.");
  }
  return {
    registrationNumber,
    scope: body.scope,
    enabled: body.enabled,
    blocked: body.blocked,
    maxRequests,
    windowSeconds,
  };
}

async function resolveLearnerId(
  client: PoolClient,
  registrationNumber: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT "id"::text AS id FROM "user" WHERE "registrationNumber" = $1`,
    [registrationNumber],
  );
  return result.rows[0]?.id ?? null;
}

export async function saveAdminRateLimitPolicy(input: {
  actorId: string;
  actorEmail: string;
  registrationNumber: string;
  scope: RateLimitScope;
  enabled: boolean;
  blocked: boolean;
  maxRequests: number;
  windowSeconds: number;
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = await resolveLearnerId(client, input.registrationNumber);
    if (!userId) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO user_rate_limit_policies
         (user_id, scope, enabled, blocked, max_requests, window_seconds, updated_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, scope) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         blocked = EXCLUDED.blocked,
         max_requests = EXCLUDED.max_requests,
         window_seconds = EXCLUDED.window_seconds,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        input.scope,
        input.enabled,
        input.blocked,
        input.maxRequests,
        input.windowSeconds,
        input.actorId,
      ],
    );
    await client.query(
      `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       VALUES ('rate-limit.update', $1, $2, $3, $4::jsonb)`,
      [
        input.actorId,
        input.actorEmail,
        userId,
        JSON.stringify({
          scope: input.scope,
          enabled: input.enabled,
          blocked: input.blocked,
          maxRequests: input.maxRequests,
          windowSeconds: input.windowSeconds,
        }),
      ],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resetAdminRateLimit(input: {
  actorId: string;
  actorEmail: string;
  registrationNumber: string;
  scope: RateLimitScope;
  restoreDefault: boolean;
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = await resolveLearnerId(client, input.registrationNumber);
    if (!userId) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "DELETE FROM user_rate_limit_usage WHERE user_id = $1::uuid AND scope = $2",
      [userId, input.scope],
    );
    if (input.restoreDefault) {
      await client.query(
        "DELETE FROM user_rate_limit_policies WHERE user_id = $1::uuid AND scope = $2",
        [userId, input.scope],
      );
    }
    await client.query(
      `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.restoreDefault ? "rate-limit.restore-default" : "rate-limit.reset-usage",
        input.actorId,
        input.actorEmail,
        userId,
        JSON.stringify({ scope: input.scope }),
      ],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function parseRateLimitScope(value: unknown): RateLimitScope {
  if (!isScope(value)) throw new Error("Choose a valid rate-limit area.");
  return value;
}

export async function cleanupExpiredRateLimitUsage(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM user_rate_limit_usage
      WHERE bucket_start < CURRENT_TIMESTAMP - INTERVAL '30 days'`,
  );
  return result.rowCount ?? 0;
}
