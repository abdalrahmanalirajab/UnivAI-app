import "server-only";

import type { PoolClient } from "pg";
import { pool } from "./db";
import { CREDIT_COSTS, type CreditPurpose } from "./credit-costs";

export { CREDIT_COSTS, type CreditPurpose } from "./credit-costs";
export type CreditReservationStatus = "reserved" | "settled" | "released" | "expired";
export type CreditTransactionReason =
  | "signup"
  | "weekly_grant"
  | "subscription_payment"
  | "spend"
  | "adjustment";

export type CreditReservation = {
  id: string;
  amount: number;
  purpose: CreditPurpose;
  status: CreditReservationStatus;
  referenceType: string | null;
  referenceId: string | null;
  expiresAt: string;
  createdAt: string;
};

export type CreditTransaction = {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: CreditTransactionReason;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreditWallet = {
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  weeklyGrantAmount: number;
  nextGrantAt: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

export type CreditActivityPage = {
  wallet: CreditWallet;
  items: CreditTransaction[];
  pagination: Pagination;
};

type CreditReservationRow = {
  id: string;
  amount: number;
  purpose: CreditPurpose;
  status: CreditReservationStatus;
  reference_type: string | null;
  reference_id: string | null;
  expires_at: Date | string;
  created_at: Date | string;
};

type CreditWalletRow = {
  balance: number;
  reserved_balance: number;
  weekly_grant_amount: number;
  next_grant_at: Date | string;
};

function timestamp(value: Date | string): string {
  return new Date(value).toISOString();
}

function reservationFromRow(row: CreditReservationRow): CreditReservation {
  return {
    id: row.id,
    amount: Number(row.amount),
    purpose: row.purpose,
    status: row.status,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
  };
}

function walletFromRow(row: CreditWalletRow): CreditWallet {
  const balance = Number(row.balance);
  const reservedBalance = Number(row.reserved_balance);
  return {
    balance,
    reservedBalance,
    availableBalance: balance - reservedBalance,
    weeklyGrantAmount: Number(row.weekly_grant_amount),
    nextGrantAt: timestamp(row.next_grant_at),
  };
}

export class CreditError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CreditError";
  }
}

function mapCreditError(error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes("INSUFFICIENT_CREDITS")) {
    throw new CreditError(
      "You do not have enough Credits for this action.",
      402,
      "INSUFFICIENT_CREDITS",
    );
  }
  if (detail.includes("CREDIT_RESERVATION_NOT_FOUND")) {
    throw new CreditError("Credit reservation not found.", 404, "RESERVATION_NOT_FOUND");
  }
  if (
    detail.includes("CREDIT_RESERVATION_NOT_ACTIVE") ||
    detail.includes("CREDIT_RESERVATION_ALREADY_SETTLED")
  ) {
    throw new CreditError(
      "This Credit reservation is no longer active.",
      409,
      "RESERVATION_NOT_ACTIVE",
    );
  }
  if (detail.includes("CREDIT_IDEMPOTENCY_CONFLICT")) {
    throw new CreditError(
      "This Credit request conflicts with an earlier action.",
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  }
  throw error;
}

async function initializeCreditAccount(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO credit_wallets
       (user_id, balance, reserved_balance, weekly_grant_amount, next_grant_at)
     VALUES ($1, 100, 0, 100, CURRENT_TIMESTAMP + INTERVAL '7 days')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await client.query(
    `INSERT INTO credit_transactions
       (user_id, amount, balance_after, reason, idempotency_key)
     VALUES ($1, 100, 100, 'signup', $2)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, `signup:${userId}`],
  );
}

export async function catchUpCreditGrantsWithClient(
  client: PoolClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  await initializeCreditAccount(client, userId);
  const result = await client.query<{ amount: number }>(
    "SELECT catch_up_credit_grants($1::uuid, $2::timestamptz) AS amount",
    [userId, now.toISOString()],
  );
  return Number(result.rows[0]?.amount ?? 0);
}

export async function getCreditActivity(
  userId: string,
  options: { page?: number; pageSize?: number; now?: Date } = {},
): Promise<CreditActivityPage> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(options.pageSize ?? 10)));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await catchUpCreditGrantsWithClient(client, userId, options.now ?? new Date());
    const walletResult = await client.query<CreditWalletRow>(
      `SELECT balance, reserved_balance, weekly_grant_amount, next_grant_at
         FROM credit_wallets WHERE user_id = $1`,
      [userId],
    );
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM credit_transactions WHERE user_id = $1",
      [userId],
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, pages);
    const activityResult = await client.query<{
      id: string;
      amount: number;
      balance_after: number;
      reason: CreditTransactionReason;
      reference_type: string | null;
      reference_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: Date | string;
    }>(
      `SELECT id::text, amount, balance_after, reason, reference_type,
              reference_id, metadata, created_at
         FROM credit_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [userId, pageSize, (normalizedPage - 1) * pageSize],
    );
    await client.query("COMMIT");
    const wallet = walletResult.rows[0];
    if (!wallet) throw new Error("Could not initialize the Credit wallet.");
    return {
      wallet: walletFromRow(wallet),
      items: activityResult.rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        reason: row.reason,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        metadata: row.metadata ?? {},
        createdAt: timestamp(row.created_at),
      })),
      pagination: { page: normalizedPage, pageSize, total, pages },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveCreditsWithClient(
  client: PoolClient,
  input: {
    userId: string;
    purpose: CreditPurpose;
    idempotencyKey: string;
    referenceType?: string | null;
    referenceId?: string | null;
    ttlSeconds?: number;
  },
): Promise<CreditReservation> {
  try {
    const result = await client.query<CreditReservationRow>(
      `SELECT id::text, amount, purpose, status, reference_type, reference_id,
              expires_at, created_at
         FROM reserve_credits($1::uuid, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId,
        CREDIT_COSTS[input.purpose],
        input.purpose,
        input.idempotencyKey,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.ttlSeconds ?? 900,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Credit reservation was not created.");
    return reservationFromRow(row);
  } catch (error) {
    return mapCreditError(error);
  }
}

export async function reserveCredits(
  input: Parameters<typeof reserveCreditsWithClient>[1],
): Promise<CreditReservation> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = await reserveCreditsWithClient(client, input);
    await client.query("COMMIT");
    return reservation;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function transitionReservation(
  client: PoolClient,
  operation: "settle" | "release",
  userId: string,
  reservationId: string,
): Promise<CreditReservation> {
  try {
    const result = await client.query<CreditReservationRow>(
      `SELECT id::text, amount, purpose, status, reference_type, reference_id,
              expires_at, created_at
         FROM ${operation}_credit_reservation($1::uuid, $2::uuid)`,
      [userId, reservationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Credit reservation was not found.");
    return reservationFromRow(row);
  } catch (error) {
    return mapCreditError(error);
  }
}

export function settleCreditReservationWithClient(
  client: PoolClient,
  userId: string,
  reservationId: string,
): Promise<CreditReservation> {
  return transitionReservation(client, "settle", userId, reservationId);
}

export function releaseCreditReservationWithClient(
  client: PoolClient,
  userId: string,
  reservationId: string,
): Promise<CreditReservation> {
  return transitionReservation(client, "release", userId, reservationId);
}

export async function releaseCreditReservation(
  userId: string,
  reservationId: string,
): Promise<CreditReservation> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = await releaseCreditReservationWithClient(client, userId, reservationId);
    await client.query("COMMIT");
    return reservation;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantSubscriptionPaymentWithClient(
  client: PoolClient,
  input: {
    userId: string;
    amount: number;
    planCode: string;
    provider: string;
    paymentId: string;
    paidAt?: Date;
  },
): Promise<{ granted: boolean; balance: number }> {
  const paidAt = input.paidAt ?? new Date();
  await catchUpCreditGrantsWithClient(client, input.userId, paidAt);
  const idempotencyKey = `subscription-payment:${input.provider}:${input.paymentId}`;
  // Serialize duplicate provider deliveries before reading the ledger. The
  // surrounding transaction then either applies the complete plan grant once
  // or observes the committed payment row.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    idempotencyKey,
  ]);
  const existing = await client.query<{ balance_after: number }>(
    `SELECT balance_after FROM credit_transactions
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  if (existing.rows[0]) {
    return { granted: false, balance: Number(existing.rows[0].balance_after) };
  }

  const wallet = await client.query<{ balance: number }>(
    `UPDATE credit_wallets
        SET balance = balance + $2,
            weekly_grant_amount = $2,
            next_grant_at = $3::timestamptz + INTERVAL '7 days',
            updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING balance`,
    [input.userId, input.amount, paidAt.toISOString()],
  );
  const balance = Number(wallet.rows[0]?.balance);
  if (!Number.isFinite(balance)) throw new Error("Credit wallet was not found.");
  await client.query(
    `INSERT INTO credit_transactions
       (user_id, amount, balance_after, reason, idempotency_key,
        reference_type, reference_id, metadata)
     VALUES ($1, $2, $3, 'subscription_payment', $4,
             'subscription_plan', $5, $6::jsonb)`,
    [
      input.userId,
      input.amount,
      balance,
      idempotencyKey,
      input.planCode,
      JSON.stringify({ provider: input.provider, payment_id: input.paymentId }),
    ],
  );
  return { granted: true, balance };
}
