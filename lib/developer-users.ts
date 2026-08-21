import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PoolClient } from "pg";

import type { SessionUser } from "./auth-types";
import { pool, query, queryOne } from "./db";
import { isDeveloperEmail } from "./developer-access";
import {
  normalizeName,
  normalizePhone,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from "./validators";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTRATION_PATTERN = /^S-\d{4}-\d{6}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type DbUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  phone: string | null;
  registrationNumber: string | null;
  uiLocale: string;
  eulaAccepted: boolean;
  eulaVersion: string | null;
  eulaAcceptedAt: string | null;
  privacyNoticeAcknowledged: boolean;
  privacyNoticeVersion: string | null;
  privacyNoticeAcknowledgedAt: string | null;
};

export type DeveloperUserSearchResult = Pick<
  DbUser,
  "id" | "name" | "email" | "emailVerified" | "role" | "banned" | "registrationNumber" | "createdAt"
> & { creditBalance: number | null };

export type DeveloperUserSnapshot = {
  user: DbUser;
  accounts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  wallet: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  recentTransactions: Array<Record<string, unknown>>;
  recentReservations: Array<Record<string, unknown>>;
  recentAudit: Array<Record<string, unknown>>;
  footprint: Array<{ table: string; rows: number }>;
};

export type DeveloperTableRecords = {
  table: string;
  primaryKey: string[];
  editableColumns: string[];
  rows: Array<{
    key: Record<string, unknown>;
    values: Record<string, unknown>;
  }>;
  truncated: boolean;
};

export type DeveloperRecordMutation = {
  key: Record<string, unknown>;
  changes: Record<string, unknown>;
  confirmation: string;
};

export type DeveloperMutation =
  | {
      action: "update_identity";
      name: string;
      email: string;
      phone: string;
      emailVerified: boolean;
      role: "student" | "admin" | "super_admin";
      banned: boolean;
      banReason?: string;
      uiLocale: "en" | "ar";
    }
  | { action: "change_registration"; registrationNumber: string }
  | { action: "set_password"; password: string }
  | { action: "replace_password_hash"; passwordHash: string; confirmation: string }
  | {
      action: "set_credits";
      balance: number;
      weeklyGrantAmount: number;
      nextGrantAt: string;
      note?: string;
    }
  | { action: "revoke_sessions" };

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new DeveloperInputError("Invalid user id.");
}

function fingerprint(value: string | null): string | null {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;
}

function cleanSearch(value: string): string {
  return value.trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
}

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error("Unsafe database identifier.");
  return `"${value}"`;
}

function sanitizeDatabaseValue(key: string, value: unknown): unknown {
  const sensitive = /(password|token|secret)/i.test(key);
  if (sensitive) {
    const text = typeof value === "string" ? value : null;
    return text ? { redacted: true, fingerprint: fingerprint(text) } : null;
  }
  if (Buffer.isBuffer(value)) return `[binary data: ${value.byteLength} bytes]`;
  if (typeof value === "string" && value.length > 20_000) {
    return `${value.slice(0, 20_000)}\n… [truncated ${value.length - 20_000} characters]`;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeDatabaseValue("", item));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeDatabaseValue(nestedKey, nestedValue),
      ])
    );
  }
  return value;
}

function sanitizeDatabaseRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeDatabaseValue(key, value)])
  );
}

export class DeveloperInputError extends Error {}
export class DeveloperNotFoundError extends Error {}

export async function searchDeveloperUsers(search = ""): Promise<DeveloperUserSearchResult[]> {
  const term = cleanSearch(search);
  return query<DeveloperUserSearchResult>(
    `SELECT u.id, u.name, u.email, u."emailVerified", u.role, u.banned,
            u."registrationNumber", u."createdAt", wallet.balance AS "creditBalance"
       FROM "user" AS u
       LEFT JOIN credit_wallets AS wallet ON wallet.user_id = u.id
      WHERE $1 = ''
         OR u.email ILIKE ('%' || $1 || '%') ESCAPE '\\'
         OR u.name ILIKE ('%' || $1 || '%') ESCAPE '\\'
         OR COALESCE(u."registrationNumber", '') ILIKE ('%' || $1 || '%') ESCAPE '\\'
      ORDER BY u."createdAt" DESC, u.id DESC
      LIMIT 30`,
    [term]
  );
}

async function getFootprint(userId: string, registrationNumber: string | null) {
  const columns = await query<{ tableName: string; columnName: string; dataType: string }>(
    `SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType"
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name <> 'legal_acceptances'
        AND column_name IN (
          'user_id', 'userId', 'student_id', 'tenant_id', 'learner_id',
          'student_sid', 'registration_number'
        )
      ORDER BY table_name, ordinal_position`
  );
  const grouped = new Map<string, typeof columns>();
  for (const column of columns) {
    if (!IDENTIFIER_PATTERN.test(column.tableName) || !IDENTIFIER_PATTERN.test(column.columnName)) continue;
    const current = grouped.get(column.tableName) ?? [];
    current.push(column);
    grouped.set(column.tableName, current);
  }

  const footprint = await Promise.all(
    [...grouped.entries()].map(async ([table, ownedColumns]) => {
      const params: unknown[] = [];
      const predicates = ownedColumns.flatMap((column) => {
        const value = column.dataType === "uuid" ? userId : registrationNumber;
        if (!value) return [];
        params.push(value);
        return [`${quoteIdentifier(column.columnName)} = $${params.length}`];
      });
      if (predicates.length === 0) return { table, rows: 0 };
      const result = await queryOne<{ rows: number }>(
        `SELECT COUNT(*)::integer AS rows FROM ${quoteIdentifier(table)} WHERE ${predicates.join(" OR ")}`,
        params
      );
      return { table, rows: result?.rows ?? 0 };
    })
  );
  return footprint.filter((entry) => entry.rows > 0).sort((a, b) => b.rows - a.rows || a.table.localeCompare(b.table));
}

export async function getDeveloperUserSnapshot(
  userId: string,
  includePasswordHash = false
): Promise<DeveloperUserSnapshot> {
  assertUuid(userId);
  const user = await queryOne<DbUser>(`SELECT * FROM "user" WHERE id = $1`, [userId]);
  if (!user) throw new DeveloperNotFoundError("User not found.");

  const [rawAccounts, sessions, wallet, subscription, recentTransactions, recentReservations, recentAudit, footprint] =
    await Promise.all([
      query<Record<string, unknown>>(
        `SELECT id, "accountId", "providerId", "userId", password,
                "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt",
                "refreshTokenExpiresAt", scope, "createdAt", "updatedAt"
           FROM "account" WHERE "userId" = $1 ORDER BY "createdAt"`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT id, "expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent", "impersonatedBy"
           FROM "session" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
        [userId]
      ),
      queryOne<Record<string, unknown>>(`SELECT * FROM credit_wallets WHERE user_id = $1`, [userId]),
      queryOne<Record<string, unknown>>(`SELECT * FROM user_subscriptions WHERE user_id = $1`, [userId]),
      query<Record<string, unknown>>(
        `SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 25`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT * FROM credit_reservations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT * FROM auth_audit WHERE target_id = $1 ORDER BY created_at DESC LIMIT 25`,
        [userId]
      ),
      getFootprint(userId, user.registrationNumber),
    ]);

  const accounts = rawAccounts.map((account) => ({
    id: account.id,
    accountId: account.accountId,
    providerId: account.providerId,
    userId: account.userId,
    passwordHash: includePasswordHash ? account.password ?? null : null,
    passwordHashPresent: Boolean(account.password),
    passwordHashFingerprint: fingerprint(typeof account.password === "string" ? account.password : null),
    accessTokenPresent: Boolean(account.accessToken),
    refreshTokenPresent: Boolean(account.refreshToken),
    idTokenPresent: Boolean(account.idToken),
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt,
    scope: account.scope,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }));

  return {
    user,
    accounts,
    sessions,
    wallet,
    subscription,
    recentTransactions,
    recentReservations,
    recentAudit,
    footprint,
  };
}

/** Lazy raw-table drilldown for every table in the user's database footprint. */
export async function getDeveloperUserTableRecords(
  userId: string,
  requestedTable: string
): Promise<DeveloperTableRecords> {
  assertUuid(userId);
  if (!IDENTIFIER_PATTERN.test(requestedTable)) throw new DeveloperInputError("Invalid table name.");
  const user = await queryOne<Pick<DbUser, "registrationNumber">>(
    `SELECT "registrationNumber" FROM "user" WHERE id = $1`,
    [userId]
  );
  if (!user) throw new DeveloperNotFoundError("User not found.");
  const columns = await query<{
    columnName: string;
    dataType: string;
    isGenerated: string;
    isIdentity: string;
  }>(
    `SELECT column_name AS "columnName", data_type AS "dataType",
            is_generated AS "isGenerated", is_identity AS "isIdentity"
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [requestedTable]
  );
  const ownershipColumns = columns.filter((column) => [
    "user_id", "userId", "student_id", "tenant_id", "learner_id",
    "student_sid", "registration_number",
  ].includes(column.columnName));
  if (requestedTable === "legal_acceptances" || ownershipColumns.length === 0) {
    throw new DeveloperInputError("That table is not linked to this user.");
  }
  const primaryKey = await query<{ columnName: string }>(
    `SELECT key_column_usage.column_name AS "columnName"
       FROM information_schema.table_constraints
       JOIN information_schema.key_column_usage
         ON key_column_usage.constraint_schema = table_constraints.constraint_schema
        AND key_column_usage.constraint_name = table_constraints.constraint_name
        AND key_column_usage.table_name = table_constraints.table_name
      WHERE table_constraints.table_schema = 'public'
        AND table_constraints.table_name = $1
        AND table_constraints.constraint_type = 'PRIMARY KEY'
      ORDER BY key_column_usage.ordinal_position`,
    [requestedTable]
  );
  const primaryKeyNames = primaryKey.map((column) => column.columnName);
  const params: unknown[] = [];
  const predicates = ownershipColumns.flatMap((column) => {
    if (!IDENTIFIER_PATTERN.test(column.columnName)) return [];
    const value = column.dataType === "uuid" ? userId : user.registrationNumber;
    if (!value) return [];
    params.push(value);
    return [`${quoteIdentifier(column.columnName)} = $${params.length}`];
  });
  const blocked = new Set([...primaryKeyNames, ...ownershipColumns.map((column) => column.columnName)]);
  const editableColumns = columns
    .filter((column) =>
      !blocked.has(column.columnName) &&
      column.isGenerated === "NEVER" &&
      column.isIdentity === "NO" &&
      column.dataType !== "bytea" &&
      !/(password|token|secret)/i.test(column.columnName)
    )
    .map((column) => column.columnName);
  if (predicates.length === 0) {
    return { table: requestedTable, primaryKey: primaryKeyNames, editableColumns, rows: [], truncated: false };
  }
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${quoteIdentifier(requestedTable)} WHERE ${predicates.join(" OR ")} LIMIT 51`,
    params
  );
  return {
    table: requestedTable,
    primaryKey: primaryKeyNames,
    editableColumns,
    rows: rows.slice(0, 50).map((row) => ({
      key: Object.fromEntries(primaryKeyNames.map((key) => [key, row[key]])),
      values: sanitizeDatabaseRow(row),
    })),
    truncated: rows.length > 50,
  };
}

/** Update a concrete user-owned row by primary key, with server-derived column permissions. */
export async function mutateDeveloperUserTableRecord(
  actor: SessionUser,
  userId: string,
  requestedTable: string,
  mutation: DeveloperRecordMutation
): Promise<void> {
  assertUuid(userId);
  if (!IDENTIFIER_PATTERN.test(requestedTable)) throw new DeveloperInputError("Invalid table name.");
  if (mutation.confirmation !== "SAVE RECORD") throw new DeveloperInputError('Type "SAVE RECORD" to confirm.');
  if (!mutation.key || typeof mutation.key !== "object" || Array.isArray(mutation.key)) throw new DeveloperInputError("A record key is required.");
  if (!mutation.changes || typeof mutation.changes !== "object" || Array.isArray(mutation.changes)) throw new DeveloperInputError("Record changes are required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await lockedUser(client, userId);
    const metadata = await client.query<{
      columnName: string;
      dataType: string;
      isGenerated: string;
      isIdentity: string;
    }>(
      `SELECT column_name AS "columnName", data_type AS "dataType",
              is_generated AS "isGenerated", is_identity AS "isIdentity"
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [requestedTable]
    );
    const ownershipColumns = metadata.rows.filter((column) => [
      "user_id", "userId", "student_id", "tenant_id", "learner_id",
      "student_sid", "registration_number",
    ].includes(column.columnName));
    if (requestedTable === "legal_acceptances" || ownershipColumns.length === 0) {
      throw new DeveloperInputError("That table is not linked to this user.");
    }
    const primaryKeyResult = await client.query<{ columnName: string }>(
      `SELECT key_column_usage.column_name AS "columnName"
         FROM information_schema.table_constraints
         JOIN information_schema.key_column_usage
           ON key_column_usage.constraint_schema = table_constraints.constraint_schema
          AND key_column_usage.constraint_name = table_constraints.constraint_name
          AND key_column_usage.table_name = table_constraints.table_name
        WHERE table_constraints.table_schema = 'public'
          AND table_constraints.table_name = $1
          AND table_constraints.constraint_type = 'PRIMARY KEY'
        ORDER BY key_column_usage.ordinal_position`,
      [requestedTable]
    );
    const primaryKey = primaryKeyResult.rows.map((column) => column.columnName);
    if (primaryKey.length === 0) throw new DeveloperInputError("This table has no stable primary key and is read-only here.");
    if (Object.keys(mutation.key).length !== primaryKey.length || primaryKey.some((key) => !(key in mutation.key))) {
      throw new DeveloperInputError("The record key does not match this table.");
    }

    const blocked = new Set([...primaryKey, ...ownershipColumns.map((column) => column.columnName)]);
    const editable = new Map(
      metadata.rows
        .filter((column) =>
          !blocked.has(column.columnName) &&
          column.isGenerated === "NEVER" &&
          column.isIdentity === "NO" &&
          column.dataType !== "bytea" &&
          !/(password|token|secret)/i.test(column.columnName)
        )
        .map((column) => [column.columnName, column])
    );
    const changes = Object.entries(mutation.changes);
    if (changes.length === 0 || changes.length > 100) throw new DeveloperInputError("Change at least one editable column.");
    for (const [column] of changes) {
      if (!editable.has(column)) throw new DeveloperInputError(`${column} is not editable from the raw record editor.`);
    }

    const whereParams: unknown[] = [];
    const ownershipPredicates = ownershipColumns.flatMap((column) => {
      const value = column.dataType === "uuid" ? userId : user.registrationNumber;
      if (!value) return [];
      whereParams.push(value);
      return [`${quoteIdentifier(column.columnName)} = $${whereParams.length}`];
    });
    const keyPredicates = primaryKey.map((column) => {
      whereParams.push(mutation.key[column]);
      return `${quoteIdentifier(column)} IS NOT DISTINCT FROM $${whereParams.length}`;
    });
    const table = quoteIdentifier(requestedTable);
    const where = `(${ownershipPredicates.join(" OR ")}) AND ${keyPredicates.join(" AND ")}`;
    const beforeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE ${where} FOR UPDATE`,
      whereParams
    );
    const before = beforeResult.rows[0];
    if (!before) throw new DeveloperNotFoundError("That record no longer belongs to this user.");

    const updateParams: unknown[] = [];
    const assignments = changes.map(([column, rawValue]) => {
      const columnMetadata = editable.get(column)!;
      const value = ["json", "jsonb"].includes(columnMetadata.dataType) && rawValue !== null
        ? JSON.stringify(rawValue)
        : rawValue;
      updateParams.push(value);
      return `${quoteIdentifier(column)} = $${updateParams.length}`;
    });
    const updateWhere = where.replace(/\$(\d+)/g, (_match, index: string) => `$${Number(index) + updateParams.length}`);
    await client.query(
      `UPDATE ${table} SET ${assignments.join(", ")} WHERE ${updateWhere}`,
      [...updateParams, ...whereParams]
    );
    await audit(client, actor, userId, "dev-update-database-record", {
      table: requestedTable,
      key: mutation.key,
      before: sanitizeDatabaseRow(Object.fromEntries(changes.map(([column]) => [column, before[column]]))),
      after: sanitizeDatabaseRow(Object.fromEntries(changes)),
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function audit(
  client: PoolClient,
  actor: SessionUser,
  targetId: string,
  action: string,
  detail: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO auth_audit (action, actor_id, actor_email, target_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [action, actor.id, actor.email, targetId, JSON.stringify(detail)]
  );
}

async function lockedUser(client: PoolClient, userId: string): Promise<DbUser> {
  const result = await client.query<DbUser>(`SELECT * FROM "user" WHERE id = $1 FOR UPDATE`, [userId]);
  const user = result.rows[0];
  if (!user) throw new DeveloperNotFoundError("User not found.");
  return user;
}

async function changeRegistration(
  client: PoolClient,
  actor: SessionUser,
  before: DbUser,
  registrationNumber: string
) {
  const next = registrationNumber.trim().toUpperCase();
  if (!REGISTRATION_PATTERN.test(next)) {
    throw new DeveloperInputError("Registration number must match S-YYYY-NNNNNN.");
  }
  if (!before.registrationNumber) throw new DeveloperInputError("This user has no registration number to migrate.");
  if (next === before.registrationNumber) return;

  const columns = await client.query<{ tableName: string; columnName: string; dataType: string }>(
    `SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType"
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name NOT IN ('user', 'legal_acceptances')
        AND column_name IN ('student_id', 'tenant_id', 'learner_id', 'student_sid', 'registration_number')
      ORDER BY table_name, ordinal_position`
  );
  const changed: Array<{ table: string; column: string; rows: number }> = [];
  for (const column of columns.rows) {
    if (column.dataType === "uuid") continue;
    const table = quoteIdentifier(column.tableName);
    const field = quoteIdentifier(column.columnName);
    const result = await client.query(
      `UPDATE ${table} SET ${field} = $1 WHERE ${field} = $2`,
      [next, before.registrationNumber]
    );
    if ((result.rowCount ?? 0) > 0) changed.push({ table: column.tableName, column: column.columnName, rows: result.rowCount ?? 0 });
  }
  await client.query(
    `UPDATE "user" SET "registrationNumber" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
    [next, before.id]
  );
  await audit(client, actor, before.id, "dev-change-registration", {
    before: before.registrationNumber,
    after: next,
    cascaded: changed,
  });
}

async function setCredentialHash(client: PoolClient, userId: string, passwordHash: string) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential' ORDER BY "createdAt" LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE "account" SET password = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      [passwordHash, existing.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO "account" ("accountId", "providerId", "userId", password, "updatedAt")
       VALUES ($1, 'credential', $2, $3, CURRENT_TIMESTAMP)`,
      [userId, userId, passwordHash]
    );
  }
  await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
}

export async function mutateDeveloperUser(
  actor: SessionUser,
  userId: string,
  mutation: DeveloperMutation
): Promise<void> {
  assertUuid(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await lockedUser(client, userId);

    if (mutation.action === "update_identity") {
      if (
        typeof mutation.name !== "string" ||
        typeof mutation.email !== "string" ||
        typeof mutation.phone !== "string" ||
        typeof mutation.emailVerified !== "boolean" ||
        typeof mutation.role !== "string" ||
        typeof mutation.banned !== "boolean" ||
        typeof mutation.uiLocale !== "string" ||
        (mutation.banReason !== undefined && typeof mutation.banReason !== "string")
      ) throw new DeveloperInputError("Complete identity values are required.");
      const name = normalizeName(mutation.name);
      const email = mutation.email.trim().toLowerCase();
      const phone = normalizePhone(mutation.phone);
      const nameError = validateName(name);
      const emailError = validateEmail(email);
      const phoneError = validatePhone(phone ?? "");
      if (nameError || emailError || phoneError) throw new DeveloperInputError(nameError ?? emailError ?? phoneError ?? "Invalid identity values.");
      if (!['student', 'admin', 'super_admin'].includes(mutation.role)) throw new DeveloperInputError("Invalid role.");
      if (!['en', 'ar'].includes(mutation.uiLocale)) throw new DeveloperInputError("Invalid locale.");
      if (actor.id === userId && !isDeveloperEmail(email)) {
        throw new DeveloperInputError("You cannot remove your own email from the developer allowlist.");
      }
      if (actor.id === userId && mutation.banned) throw new DeveloperInputError("You cannot ban your current developer account.");
      const banReason = mutation.banned ? (mutation.banReason ?? "").trim().slice(0, 500) || null : null;
      await client.query(
        `UPDATE "user"
            SET name = $1, email = $2, phone = $3, "emailVerified" = $4,
                role = $5, banned = $6, "banReason" = $7, "uiLocale" = $8,
                "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $9`,
        [name, email, phone, mutation.emailVerified, mutation.role, mutation.banned, banReason, mutation.uiLocale, userId]
      );
      await audit(client, actor, userId, "dev-update-identity", {
        before: { name: before.name, email: before.email, phone: before.phone, emailVerified: before.emailVerified, role: before.role, banned: before.banned, banReason: before.banReason, uiLocale: before.uiLocale },
        after: { name, email, phone, emailVerified: mutation.emailVerified, role: mutation.role, banned: mutation.banned, banReason, uiLocale: mutation.uiLocale },
      });
    } else if (mutation.action === "change_registration") {
      if (typeof mutation.registrationNumber !== "string") throw new DeveloperInputError("Registration number is required.");
      await changeRegistration(client, actor, before, mutation.registrationNumber);
    } else if (mutation.action === "set_password") {
      if (typeof mutation.password !== "string") throw new DeveloperInputError("Password is required.");
      const passwordError = validatePassword(mutation.password);
      if (passwordError) throw new DeveloperInputError(passwordError);
      const passwordHash = await hashPassword(mutation.password);
      await setCredentialHash(client, userId, passwordHash);
      await audit(client, actor, userId, "dev-set-password", { sessionsRevoked: true, hashFingerprint: fingerprint(passwordHash) });
    } else if (mutation.action === "replace_password_hash") {
      if (typeof mutation.passwordHash !== "string" || typeof mutation.confirmation !== "string") throw new DeveloperInputError("Password hash and confirmation are required.");
      if (mutation.confirmation !== "REPLACE HASH") throw new DeveloperInputError('Type "REPLACE HASH" to confirm.');
      const passwordHash = mutation.passwordHash.trim();
      if (passwordHash.length < 20 || passwordHash.length > 1024) throw new DeveloperInputError("Password hash must be 20 to 1024 characters.");
      await setCredentialHash(client, userId, passwordHash);
      await audit(client, actor, userId, "dev-replace-password-hash", { sessionsRevoked: true, hashFingerprint: fingerprint(passwordHash) });
    } else if (mutation.action === "set_credits") {
      if (typeof mutation.balance !== "number" || typeof mutation.weeklyGrantAmount !== "number" || typeof mutation.nextGrantAt !== "string" || (mutation.note !== undefined && typeof mutation.note !== "string")) throw new DeveloperInputError("Complete credit values are required.");
      if (!Number.isSafeInteger(mutation.balance) || mutation.balance < 0 || mutation.balance > 1_000_000_000) throw new DeveloperInputError("Balance must be a whole number from 0 to 1,000,000,000.");
      if (!Number.isSafeInteger(mutation.weeklyGrantAmount) || mutation.weeklyGrantAmount < 0 || mutation.weeklyGrantAmount > 1_000_000_000) throw new DeveloperInputError("Weekly grant must be a whole number from 0 to 1,000,000,000.");
      const nextGrantAt = new Date(mutation.nextGrantAt);
      if (Number.isNaN(nextGrantAt.valueOf())) throw new DeveloperInputError("Next grant date is invalid.");
      const wallet = await client.query<{ balance: number; reservedBalance: number }>(
        `SELECT balance, reserved_balance AS "reservedBalance" FROM credit_wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const previousBalance = wallet.rows[0]?.balance ?? 0;
      const reservedBalance = wallet.rows[0]?.reservedBalance ?? 0;
      if (mutation.balance < reservedBalance) throw new DeveloperInputError(`Balance cannot be lower than the reserved balance (${reservedBalance}).`);
      await client.query(
        `INSERT INTO credit_wallets (user_id, balance, weekly_grant_amount, next_grant_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
           SET balance = EXCLUDED.balance,
               weekly_grant_amount = EXCLUDED.weekly_grant_amount,
               next_grant_at = EXCLUDED.next_grant_at,
               updated_at = CURRENT_TIMESTAMP`,
        [userId, mutation.balance, mutation.weeklyGrantAmount, nextGrantAt.toISOString()]
      );
      const delta = mutation.balance - previousBalance;
      if (delta !== 0) {
        await client.query(
          `INSERT INTO credit_transactions
             (user_id, amount, balance_after, reason, idempotency_key, reference_type, reference_id, metadata)
           VALUES ($1, $2, $3, 'adjustment', $4, 'developer_dashboard', $5, $6::jsonb)`,
          [userId, delta, mutation.balance, `dev-adjustment:${randomUUID()}`, actor.id, JSON.stringify({ note: (mutation.note ?? "").trim().slice(0, 500), actorEmail: actor.email })]
        );
      }
      await audit(client, actor, userId, "dev-set-credits", {
        beforeBalance: previousBalance,
        balance: mutation.balance,
        weeklyGrantAmount: mutation.weeklyGrantAmount,
        nextGrantAt: nextGrantAt.toISOString(),
        note: (mutation.note ?? "").trim().slice(0, 500),
      });
    } else if (mutation.action === "revoke_sessions") {
      const removed = await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
      await audit(client, actor, userId, "dev-revoke-sessions", { sessionsRevoked: removed.rowCount ?? 0 });
    } else {
      throw new DeveloperInputError("Unsupported developer action.");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
