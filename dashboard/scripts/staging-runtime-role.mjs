// Guarded creation of the restricted runtime role for the TikTok STAGING
// dashboard database (Neon). See TIKTOK-STAGING-PLAN.md §12 (G4 step 3).
//
//   STAGING_DATABASE_URL=<owner, hidden> node scripts/staging-runtime-role.mjs --endpoint ep-…          (create + verify)
//   STAGING_DATABASE_URL=<owner, hidden> node scripts/staging-runtime-role.mjs --endpoint ep-… --check  (verify only)
//
// The role is created WITHOUT login and without a password: it can't be used
// until G6 enables login with a fresh password that goes straight into Vercel.
// It may only read and write rows of the application tables: no DDL, no
// migration schema, no superuser/BYPASSRLS/CREATEDB/CREATEROLE, no memberships.
// Prints only facts about the role, never the connection string.
import pg from "pg";
import { checkTarget } from "./staging-migrate.mjs";

export const ROLE = "admate_runtime";

// One transaction: everything or nothing. Idempotent (safe to run twice).
export const CREATE_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
    CREATE ROLE ${ROLE} NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ${ROLE};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE};
`;

// Every value must match problemsOf's expectations for the role to count as
// restricted. Run only when the role exists (the privilege functions need it).
export const CHECK_SQL = `
WITH r AS (SELECT * FROM pg_roles WHERE rolname = '${ROLE}'),
t AS (SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'),
s AS (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S')
SELECT
  (SELECT count(*) FROM r)::int AS exists,
  (SELECT rolsuper FROM r) AS superuser,
  (SELECT rolbypassrls FROM r) AS bypassrls,
  (SELECT rolcreatedb FROM r) AS createdb,
  (SELECT rolcreaterole FROM r) AS createrole,
  (SELECT rolreplication FROM r) AS replication,
  (SELECT rolcanlogin FROM r) AS can_login,
  (SELECT count(*) FROM pg_auth_members m WHERE m.member = (SELECT oid FROM r))::int AS memberships,
  (SELECT count(*) FROM pg_class WHERE relowner = (SELECT oid FROM r))::int AS owned_objects,
  (SELECT count(*) FROM t)::int AS tables,
  (SELECT count(*) FROM t WHERE has_table_privilege('${ROLE}', t.oid, 'SELECT, INSERT, UPDATE, DELETE')
     AND has_table_privilege('${ROLE}', t.oid, 'SELECT') AND has_table_privilege('${ROLE}', t.oid, 'INSERT')
     AND has_table_privilege('${ROLE}', t.oid, 'UPDATE') AND has_table_privilege('${ROLE}', t.oid, 'DELETE'))::int AS tables_rw,
  (SELECT count(*) FROM t WHERE has_table_privilege('${ROLE}', t.oid, 'TRUNCATE, REFERENCES, TRIGGER'))::int AS tables_extra,
  (SELECT count(*) FROM s)::int AS sequences,
  (SELECT count(*) FROM s WHERE has_sequence_privilege('${ROLE}', s.oid, 'USAGE'))::int AS sequences_usable,
  has_schema_privilege('${ROLE}', 'public', 'CREATE') AS can_create_in_public,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN has_schema_privilege('${ROLE}', 'drizzle', 'USAGE') ELSE false END) AS sees_migrations,
  has_database_privilege('${ROLE}', current_database(), 'CREATE') AS can_create_schema
`;

export function problemsOf(row) {
  const problems = [];
  if (row.exists !== 1) problems.push("role missing");
  for (const k of ["superuser", "bypassrls", "createdb", "createrole", "replication", "can_login", "can_create_in_public", "sees_migrations", "can_create_schema"]) {
    if (row[k] !== false) problems.push(`${k} should be false`);
  }
  if (row.memberships !== 0) problems.push("role has memberships");
  if (row.owned_objects !== 0) problems.push("role owns objects");
  if (row.tables === 0 || row.tables_rw !== row.tables) problems.push(`read/write on ${row.tables_rw} of ${row.tables} tables`);
  if (row.tables_extra !== 0) problems.push("extra table privileges");
  if (row.sequences_usable !== row.sequences) problems.push(`usage on ${row.sequences_usable} of ${row.sequences} sequences`);
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const endpoint = args.includes("--endpoint") ? args[args.indexOf("--endpoint") + 1] : undefined;
  const problem = checkTarget(process.env.STAGING_DATABASE_URL, endpoint);
  if (problem) {
    console.error(`[staging-runtime-role] ${problem}`);
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: process.env.STAGING_DATABASE_URL });
  await client.connect();
  try {
    const migrated = (await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok")).rows[0].ok;
    if (!migrated) {
      console.error("[staging-runtime-role] Refused: run the migrations first (step 2). Nothing was changed.");
      process.exit(3);
    }
    if (!args.includes("--check")) {
      await client.query("BEGIN");
      await client.query(CREATE_SQL);
      await client.query("COMMIT");
      console.log(`[staging-runtime-role] Role ${ROLE} created or updated (no login, no password).`);
    }
    const exists = (await client.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname = $1", [ROLE])).rows[0].n === 1;
    if (!exists) {
      console.log(`[staging-runtime-role] NOT OK: role ${ROLE} does not exist yet.`);
      process.exitCode = 4;
      return;
    }
    const row = (await client.query(CHECK_SQL)).rows[0];
    const problems = problemsOf(row);
    console.log(
      `[staging-runtime-role] ${ROLE}: login=${row.can_login} superuser=${row.superuser} bypassrls=${row.bypassrls} createdb=${row.createdb} createrole=${row.createrole} replication=${row.replication}`,
    );
    console.log(
      `[staging-runtime-role] read/write on ${row.tables_rw}/${row.tables} tables, sequences ${row.sequences_usable}/${row.sequences}, extra table rights ${row.tables_extra}, memberships ${row.memberships}, owned objects ${row.owned_objects}, create in public=${row.can_create_in_public}, sees migrations=${row.sees_migrations}`,
    );
    console.log(problems.length ? `[staging-runtime-role] NOT OK: ${problems.join("; ")}` : "[staging-runtime-role] OK: restricted as intended.");
    if (problems.length) process.exitCode = 4;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[staging-runtime-role] Failed: ${error?.code ?? error?.name ?? "error"}. The transaction was rolled back.`);
    process.exit(1);
  });
}
