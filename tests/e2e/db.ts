import pg from "pg";

// Direct access to the local Supabase database for E2E setup that the UI
// can't do (e.g. bulk rows). Local stack only; never point this at production.
export const LOCAL_DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
