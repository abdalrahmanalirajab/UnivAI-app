import { Pool } from "pg";
import { env } from "./env";

const globalForPool = globalThis as unknown as { univaiPool?: Pool };

export const pool =
  globalForPool.univaiPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForPool.univaiPool = pool;

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
