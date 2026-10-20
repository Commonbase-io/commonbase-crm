import pg from "pg";
import { afterAll, inject } from "vitest";

// Seed fixtures (see supabase/seed.sql).
export const T = {
  brs: "a0000000-0000-4000-8000-000000000001",
  harbor: "b0000000-0000-4000-8000-000000000001",
} as const;

export const U = {
  staff: "c0000000-0000-4000-8000-000000000001",
  brsAdmin: "a0000000-0000-4000-8000-0000000000a1",
  brsManager: "a0000000-0000-4000-8000-0000000000a2",
  brsRep: "a0000000-0000-4000-8000-0000000000a3",
  harborAdmin: "b0000000-0000-4000-8000-0000000000b1",
  harborRep: "b0000000-0000-4000-8000-0000000000b3",
} as const;

export const SEED = {
  brsConnection: "a0000000-0000-4000-8000-0000000000c1",
  harborConnection: "b0000000-0000-4000-8000-0000000000c1",
  brsMailbox: "a0000000-0000-4000-8000-0000000000d1",
  harborMailbox: "b0000000-0000-4000-8000-0000000000d1",
  brsCompany: "a1000000-0000-4000-8000-000000000001",
  harborCompany: "b1000000-0000-4000-8000-000000000001",
  brsContact: "a2000000-0000-4000-8000-000000000001",
  brsUnenrolledContact: "a2000000-0000-4000-8000-000000000003",
  brsOptedOutContact: "a2000000-0000-4000-8000-000000000008",
  brsCustomerContact: "a2000000-0000-4000-8000-000000000006",
  harborContact: "b2000000-0000-4000-8000-000000000001",
  brsActiveCampaign: "a3000000-0000-4000-8000-000000000001",
  brsNonCompliantDraft: "a3000000-0000-4000-8000-000000000002",
  brsRepOpportunity: "a4000000-0000-4000-8000-000000000001",
  brsManagerOpportunity: "a4000000-0000-4000-8000-000000000003",
  harborOpportunity: "b4000000-0000-4000-8000-000000000001",
} as const;

const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 4 });
afterAll(() => pool.end());

export type Db = pg.PoolClient;

/**
 * Runs `fn` inside a transaction as the given role (and user, for
 * `authenticated`), exactly as PostgREST would, then rolls back so tests never
 * leak state into each other.
 */
export async function as<T>(
  who: { role: "authenticated"; userId: string } | { role: "anon" } | { role: "service_role" },
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const claims = who.role === "authenticated" ? { sub: who.userId, role: who.role } : { role: who.role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await client.query(`set local role ${who.role}`);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

export const asUser = <T>(userId: string, fn: (db: Db) => Promise<T>) => as({ role: "authenticated", userId }, fn);
export const asService = <T>(fn: (db: Db) => Promise<T>) => as({ role: "service_role" }, fn);

/** Runs a statement inside a savepoint and returns the Postgres error, if any. */
export async function attempt(db: Db, sql: string, params: unknown[] = []): Promise<{ rowCount: number; error?: string; code?: string }> {
  await db.query("savepoint attempt");
  try {
    const result = await db.query(sql, params);
    await db.query("release savepoint attempt");
    return { rowCount: result.rowCount ?? 0 };
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    const e = error as { message: string; code?: string };
    return { rowCount: 0, error: e.message, code: e.code };
  }
}
