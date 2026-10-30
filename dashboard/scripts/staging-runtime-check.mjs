// Proves the restricted runtime role works as intended, on a DISPOSABLE Neon
// branch only. See TIKTOK-STAGING-PLAN.md §12 (G4 step 4).
//
//   STAGING_DATABASE_URL=<test-run branch owner URL, hidden> \
//     node scripts/staging-runtime-check.mjs --endpoint ep-<test-run> --protect ep-<main staging>
//
// Refuses the protected (main staging) endpoint. On the test branch it gives
// admate_runtime a temporary random password (valid 1 hour, never printed),
// signs in as that role, and checks inside a transaction that is always rolled
// back: row reads/writes and the account row lock work; creating, altering or
// truncating tables, creating schemas and reading the migrations schema are
// refused. Login is switched off again at the end. Prints pass/fail only.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { checkTarget } from "./staging-migrate.mjs";
import { CHECK_SQL, problemsOf, ROLE } from "./staging-runtime-role.mjs";

const ALLOWED = [
  ["insert a row", "INSERT INTO users (id, email, password_hash) VALUES ('runtime-check', 'runtime-check@example.invalid', '!')"],
  ["read rows", "SELECT count(*) FROM users"],
  ["update a row", "UPDATE users SET last_login_at = now() WHERE id = 'runtime-check'"],
  ["lock a row (imports use this)", "SELECT id FROM users WHERE id = 'runtime-check' FOR UPDATE"],
  ["delete a row", "DELETE FROM users WHERE id = 'runtime-check'"],
];
const REFUSED = [
  ["create a table", "CREATE TABLE public.runtime_check (x int)"],
  ["alter a table", "ALTER TABLE facts ADD COLUMN runtime_check int"],
  ["truncate a table", "TRUNCATE facts"],
  ["drop a table", "DROP TABLE users"],
  ["create a schema", "CREATE SCHEMA runtime_check"],
  ["read the migrations record", "SELECT count(*) FROM drizzle.__drizzle_migrations"],
  ["create a role", "CREATE ROLE runtime_check_role"],
];

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const endpoint = arg("--endpoint");
  const protect = arg("--protect");
  const problem = checkTarget(process.env.STAGING_DATABASE_URL, endpoint);
  if (problem) {
    console.error(`[staging-runtime-check] ${problem}`);
    process.exit(2);
  }
  if (!protect || protect === endpoint) {
    console.error("[staging-runtime-check] Refused: pass --protect with the MAIN staging endpoint; this check runs only on a different, disposable branch.");
    process.exit(2);
  }

  const owner = new pg.Client({ connectionString: process.env.STAGING_DATABASE_URL });
  await owner.connect();
  let enabled = false;
  let failures = 0;
  try {
    const exists = (await owner.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname = $1", [ROLE])).rows[0].n === 1;
    if (!exists) throw Object.assign(new Error("role missing"), { code: "ROLE_MISSING" });
    const before = problemsOf((await owner.query(CHECK_SQL)).rows[0]);
    console.log(before.length ? `[staging-runtime-check] Role before test: NOT OK (${before.join("; ")})` : "[staging-runtime-check] Role before test: restricted, no login.");
    if (before.length) failures++;

    // Temporary login on THIS branch only.
    const password = randomBytes(24).toString("base64url");
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await owner.query(`ALTER ROLE ${ROLE} LOGIN PASSWORD '${password}' VALID UNTIL '${until}'`);
    enabled = true;

    const url = new URL(process.env.STAGING_DATABASE_URL);
    url.username = ROLE;
    url.password = password;
    const runtime = new pg.Client({ connectionString: url.toString() });
    await runtime.connect();
    try {
      const who = (await runtime.query("SELECT current_user AS u")).rows[0].u;
      console.log(`[staging-runtime-check] ${who === ROLE ? "PASS" : "FAIL"}  sign in as ${ROLE}`);
      if (who !== ROLE) failures++;
      await runtime.query("BEGIN");
      for (const [label, sql] of ALLOWED) {
        await runtime.query("SAVEPOINT s");
        try {
          await runtime.query(sql);
          console.log(`[staging-runtime-check] PASS  allowed: ${label}`);
        } catch (error) {
          failures++;
          console.log(`[staging-runtime-check] FAIL  should be allowed: ${label} (${error.code})`);
          await runtime.query("ROLLBACK TO SAVEPOINT s");
        }
      }
      for (const [label, sql] of REFUSED) {
        await runtime.query("SAVEPOINT s");
        try {
          await runtime.query(sql);
          failures++;
          console.log(`[staging-runtime-check] FAIL  should be refused: ${label}`);
        } catch (error) {
          const ok = error.code === "42501"; // insufficient_privilege
          if (!ok) failures++;
          console.log(`[staging-runtime-check] ${ok ? "PASS" : "FAIL"}  refused: ${label}${ok ? "" : ` (unexpected ${error.code})`}`);
        }
        await runtime.query("ROLLBACK TO SAVEPOINT s");
      }
      await runtime.query("ROLLBACK"); // nothing is kept, even on the test branch
    } finally {
      await runtime.end();
    }
  } finally {
    if (enabled) await owner.query(`ALTER ROLE ${ROLE} NOLOGIN PASSWORD NULL`).catch(() => failures++);
    await owner.end();
  }
  console.log(failures ? `[staging-runtime-check] RESULT: ${failures} problem(s).` : "[staging-runtime-check] RESULT: all checks passed; login switched off again.");
  if (failures) process.exitCode = 4;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[staging-runtime-check] Failed: ${error?.code ?? error?.name ?? "error"}.`);
    process.exit(1);
  });
}
