// Applies drizzle/ migrations to the hosted Postgres before `next build`, so the
// database schema always matches the code being deployed. Without DATABASE_URL
// (local dev on PGlite) there is nothing to do: PGlite migrates itself on start.
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Same variables as lib/db/client.ts (including the "DATABASE_URL_" prefix the
// Vercel Neon integration uses on this project), preferring Neon's direct
// (non-pooled) connection, which Neon recommends for schema changes.
const env = process.env;
const url =
  env.POSTGRES_URL_NON_POOLING ||
  env.DATABASE_URL_POSTGRES_URL_NON_POOLING ||
  env.DATABASE_URL ||
  env.POSTGRES_URL ||
  env.DATABASE_URL_DATABASE_URL ||
  env.DATABASE_URL_POSTGRES_URL;
if (!url) {
  console.log("[migrate] No DATABASE_URL: skipping (local PGlite migrates on start).");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("[migrate] Database is up to date.");
} finally {
  await pool.end();
}
