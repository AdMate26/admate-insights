import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Two drivers, one schema:
// - DATABASE_URL set (Vercel + Neon, or any hosted Postgres): node-postgres pool.
//   Migrations run before the build (scripts/migrate.mjs), not here, so parallel
//   cold starts never race on them.
// - No DATABASE_URL (local dev): an embedded Postgres (PGlite) in .data/pglite,
//   migrated on first use.
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __admateDb?: Promise<DB> };

// Vercel's Neon integration can add its variables with a custom prefix; the
// admate project uses "DATABASE_URL_" (so DATABASE_URL_DATABASE_URL etc.).
export function databaseUrl(): string | undefined {
  const env = process.env;
  return env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_DATABASE_URL || env.DATABASE_URL_POSTGRES_URL || undefined;
}

async function initPostgres(url: string): Promise<DB> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { attachDatabasePool } = await import("@vercel/functions");
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5000 });
  // On Vercel, closes idle connections before a function instance is suspended.
  attachDatabasePool(pool);
  return drizzle({ client: pool, schema }) as unknown as DB;
}

async function initPglite(): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.ADMATE_DATA_DIR ?? path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(path.join(dir, "pglite"));
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as DB;
}

// One instance per server process (survives dev hot reloads).
export function getDb(): Promise<DB> {
  if (!globalForDb.__admateDb) {
    const url = databaseUrl();
    globalForDb.__admateDb = url ? initPostgres(url) : initPglite();
  }
  return globalForDb.__admateDb;
}
