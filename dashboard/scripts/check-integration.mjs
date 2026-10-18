// Proves that Project B's files are unchanged except for the integration
// adjustments listed in INTEGRATION.md.
//
//   node scripts/check-integration.mjs
//
// Every file recorded in integration.lock.json (B's commit, Git blob hashes)
// must still exist with the same hash, unless INTEGRATION.md lists it as
// modified or deleted. Every file that isn't in the lock must be listed as
// added. Git-ignored output (.next, node_modules, .data, next-env.d.ts) is
// skipped. Exit code 1 on any unlisted difference.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const lock = JSON.parse(readFileSync(path.join(root, "integration.lock.json"), "utf8"));
const manifest = readFileSync(path.join(root, "INTEGRATION.md"), "utf8");

// The "Changed files" table: | `path` | added / modified / deleted | … |
const listed = new Map();
for (const m of manifest.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(added|modified|deleted)\s*\|/gm)) listed.set(m[1], m[2]);

const IGNORED = new Set([".next", "node_modules", ".data", ".next-review", "next-env.d.ts", ".env.local", ".vercel"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name) || name.endsWith(".tsbuildinfo")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}
const blob = (file) => {
  const data = readFileSync(path.join(root, file));
  return createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
};

const present = new Set(walk(root));
const problems = [];
for (const [file, hash] of Object.entries(lock.files)) {
  const kind = listed.get(file);
  if (!present.has(file)) {
    if (kind !== "deleted") problems.push(`missing (not listed as deleted): ${file}`);
    continue;
  }
  const same = blob(file) === hash;
  if (kind === "deleted") problems.push(`listed as deleted but present: ${file}`);
  else if (!same && kind !== "modified") problems.push(`changed (not listed as modified): ${file}`);
  else if (same && kind === "modified") problems.push(`listed as modified but unchanged: ${file}`);
}
for (const file of present) {
  if (file in lock.files) continue;
  if (listed.get(file) !== "added") problems.push(`new file (not listed as added): ${file}`);
}
for (const [file, kind] of listed) {
  if (kind === "added" && !present.has(file)) problems.push(`listed as added but missing: ${file}`);
}

const counts = { modified: 0, added: 0, deleted: 0 };
for (const kind of listed.values()) counts[kind]++;
const untouched = Object.keys(lock.files).filter((f) => !listed.has(f)).length;
if (problems.length) {
  console.error(`Integration check FAILED (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `Integration check passed: ${untouched} of ${Object.keys(lock.files).length} Project B files byte-identical to ${lock.source.commit.slice(0, 7)}; ` +
    `${counts.modified} modified, ${counts.deleted} deleted, ${counts.added} added (all listed in INTEGRATION.md).`,
);
