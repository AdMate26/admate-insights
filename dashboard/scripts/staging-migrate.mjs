// Guarded one-time setup of the TikTok STAGING dashboard database (Neon).
// See TIKTOK-STAGING-PLAN.md §12 (G4). Never used for production.
//
//   STAGING_DATABASE_URL=<hidden> node scripts/staging-migrate.mjs --endpoint ep-…   (apply)
//   STAGING_DATABASE_URL=<hidden> node scripts/staging-migrate.mjs --endpoint ep-… --check
//   STAGING_DATABASE_URL=<hidden> node scripts/staging-migrate.mjs --endpoint ep-… --upgrade  (pending migrations only)
//
// Refuses unless the connection string points at exactly the expected Neon
// compute endpoint (direct, not the pooler) and, when applying, the database is
// empty. --upgrade instead requires a database this script already set up (it
// has the migrations record) and applies only the migrations it hasn't got yet.
// Drizzle applies them in one transaction: all or nothing. Prints only the endpoint ID, database name, migration count and table
// names: never the connection string, user or password.
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export function checkTarget(raw, endpoint) {
  if (!/^ep-[a-z]+-[a-z]+-[a-z0-9]+$/.test(endpoint ?? "")) return "Pass --endpoint with the Neon compute endpoint ID (ep-…).";
  let url;
  try {
    url = new URL(raw ?? "");
  } catch {
    return "STAGING_DATABASE_URL is missing or not a connection string.";
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return "Not a Postgres connection string.";
  const host = url.hostname;
  if (host.startsWith(`${endpoint}-pooler.`)) return "This is the pooled connection. Turn off \"Connection pooling\" in Neon's Connect box and copy the direct one.";
  if (!host.startsWith(`${endpoint}.`) || !host.endsWith(".neon.tech")) return `Refused: this connection string is not for endpoint ${endpoint}.`;
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const endpoint = args[args.indexOf("--endpoint") + 1];
  const checkOnly = args.includes("--check");
  const upgrade = args.includes("--upgrade");
  const raw = process.env.STAGING_DATABASE_URL;
  const problem = checkTarget(raw, args.includes("--endpoint") ? endpoint : undefined);
  if (problem) {
    console.error(`[staging-migrate] ${problem}`);
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: raw, max: 1 });
  const tables = async () =>
    (await pool.query("select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public','drizzle') order by 1")).rows.map((r) => r.t);
  try {
    const { rows } = await pool.query("select current_database() as db");
    console.log(`[staging-migrate] Connected to endpoint ${endpoint}, database ${rows[0].db}.`);
    const before = await tables();
    const recorded = async () =>
      (await tables()).includes("drizzle.__drizzle_migrations") ? (await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n : 0;
    if (upgrade) {
      const had = await recorded();
      if (!had) {
        console.error("[staging-migrate] Refused: --upgrade needs a database set up by this script (no migrations record found). Nothing was changed.");
        process.exit(3);
      }
      await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      console.log(`[staging-migrate] Upgrade: ${(await recorded()) - had} new migration(s) applied (had ${had}).`);
    } else if (!checkOnly) {
      if (before.length) {
        console.error(`[staging-migrate] Refused: the database is not empty (${before.length} tables). Nothing was changed.`);
        process.exit(3);
      }
      await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      console.log("[staging-migrate] Migrations applied.");
    }
    const after = await tables();
    const hasJournal = after.includes("drizzle.__drizzle_migrations");
    const applied = hasJournal ? (await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n : 0;
    console.log(`[staging-migrate] Migrations recorded: ${applied}. Application tables: ${after.filter((t) => t.startsWith("public.")).length}.`);
    console.log(`[staging-migrate] ${after.filter((t) => t.startsWith("public.")).map((t) => t.slice(7)).join(", ") || "(none)"}`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // pg errors can echo connection details; print only the error class and code.
    console.error(`[staging-migrate] Failed: ${error?.code ?? error?.name ?? "error"}. Nothing else was changed.`);
    process.exit(1);
  });
}
