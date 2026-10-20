import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

// Creates a throwaway database, applies the Supabase shim, every migration in
// order, and the seed, then hands its URL to the db test project.

const root = path.resolve(import.meta.dirname, "../..");
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const dbName = `cb_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const databaseUrl = url.toString();

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const migrationsDir = path.join(root, "supabase/migrations");
    const migrations = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const files = [
      path.join(root, "supabase/tests/supabase-shim.sql"),
      ...migrations.map((f) => path.join(migrationsDir, f)),
      path.join(root, "supabase/seed.sql"),
    ];
    for (const file of files) {
      try {
        await client.query(await readFile(file, "utf8"));
      } catch (error) {
        throw new Error(`Failed applying ${path.relative(root, file)}: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }

  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  };
}
