// End-to-end check of the dashboard behind the website's /app proxy, on
// localhost only (AdMate integration, INTEGRATION.md).
//
//   node scripts/e2e-proxy.mjs
//
// Starts a FAKE Supabase Auth server, this dashboard (`next start`, port 3100)
// on a throwaway embedded database, and the website's production server (port
// 3000) whose Nitro route rule proxies /app to the dashboard. Then it drives
// the real flows through http://localhost:3000 the way a browser does,
// including the real Server Actions (encoded with React's own encodeReply):
// sign-in bridge, decisions, targets/settings, sample reset, sign-out from
// either side, unauthorized origins and access after sign-out.
//
// Nothing real is contacted: no Supabase project, no database other than a
// temporary PGlite directory, no Telegram. Tokens and cookies are made up and
// never printed.
//
// Prerequisites (built beforehand, see INTEGRATION.md):
//   dashboard/: ADMATE_PUBLIC_ORIGIN=http://localhost:3000 npx next build
//   website:    ADMATE_DASHBOARD_ORIGIN=http://localhost:3100 NITRO_PRESET=node-server npx vite build
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node.js");

const DASHBOARD = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const WEBSITE = path.dirname(DASHBOARD);
const A_PORT = Number(process.env.E2E_SITE_PORT ?? 3000);
const A = `http://localhost:${A_PORT}`;
const B_PORT = Number(process.env.E2E_DASHBOARD_PORT ?? 3100);
const MOCK_PORT = Number(process.env.E2E_AUTH_PORT ?? 3400);
const OWNER = "00000000-0000-4000-8000-00000000e2e1"; // made-up test owner
const OTHER = "00000000-0000-4000-8000-00000000e2e2"; // made-up non-owner
const USER_A = "00000000-0000-4000-8000-00000000e2ea"; // made-up user A (open registration)
const USER_B = "00000000-0000-4000-8000-00000000e2eb"; // made-up user B (open registration)
const TOKENS = {
  "owner.e2e.sig": { id: OWNER, email: "owner@e2e.test" },
  "other.e2e.sig": { id: OTHER, email: "other@e2e.test" },
  "a.e2e.sig": { id: USER_A, email: "a@e2e.test" },
  "b.e2e.sig": { id: USER_B, email: "b@e2e.test" },
};
const CRON = "e2e-cron-secret-0123456789abcdef0123"; // test-only
let accessMode = ""; // "" = owner only, "open" = open registration

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
  return cond;
};

/* ------------------------------ processes ------------------------------- */

const dataDir = mkdtempSync(path.join(os.tmpdir(), "admate-e2e-proxy-"));
const children = new Set();
const mock = http.createServer((req, res) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const user = req.url === "/auth/v1/user" ? TOKENS[token] : undefined;
  res.writeHead(user ? 200 : 401, { "content-type": "application/json" });
  res.end(JSON.stringify(user ?? { error_code: "bad_jwt" }));
});

function start(name, cmd, args, cwd, env) {
  const child = spawn(cmd, args, { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.log = "";
  child.stdout.on("data", (d) => (child.log += d));
  child.stderr.on("data", (d) => (child.log += d));
  child.name = name;
  children.add(child);
  return child;
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`not reachable: ${url}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill("SIGTERM");
  await done;
  children.delete(child);
}
let dashboard;
async function startDashboard() {
  dashboard = start("dashboard", process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(B_PORT)], DASHBOARD, {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    ADMATE_PUBLIC_ORIGIN: A,
    SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
    META_OWNER_USER_ID: OWNER,
    ADMATE_DATA_DIR: dataDir,
    ADMATE_ACCESS: accessMode,
    CRON_SECRET: CRON,
  });
  await waitFor(`http://localhost:${B_PORT}/app/api/counts`);
}

/* ------------------------------- browser -------------------------------- */

let cookie = null; // the admate_session cookie, kept in memory only
function keepCookie(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = c.split(";");
    const [name, value] = pair.split("=");
    if (name.trim() !== "admate_session") continue;
    const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a) || /max-age=0/i.test(a)) || value === "";
    cookie = expired ? null : value;
  }
}
async function get(p) {
  const res = await fetch(A + p, { redirect: "manual", headers: cookie ? { cookie: `admate_session=${cookie}` } : {} });
  keepCookie(res);
  return res;
}
async function bridge(method, token, origin = A) {
  const headers = { origin, "sec-fetch-site": origin === A ? "same-origin" : "cross-site" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = `admate_session=${cookie}`;
  const res = await fetch(`${A}/app/api/session`, { method, headers });
  keepCookie(res);
  return res;
}
// A Server Action call, exactly as Next.js's client sends it.
async function action(page, id, args, origin = A) {
  const body = await encodeReply(args);
  const headers = { "next-action": id, accept: "text/x-component", origin };
  if (typeof body === "string") headers["content-type"] = "text/plain;charset=UTF-8";
  if (cookie) headers.cookie = `admate_session=${cookie}`;
  const res = await fetch(A + page, { method: "POST", headers, body, redirect: "manual" });
  keepCookie(res);
  const debug = process.env.E2E_DEBUG ? Object.fromEntries([...res.headers].filter(([k]) => /^(x-action|location|content-type|x-nextjs)/i.test(k))) : null;
  if (debug) console.log("   debug:", res.status, JSON.stringify(debug));
  return { status: res.status, redirect: res.headers.get("x-action-redirect"), text: await res.text() };
}
const workspaceOf = (res) => /\/app\/c\/([0-9a-f-]{36})/.exec(res.headers.get("location") ?? "")?.[1] ?? null;

/* ------------------------- Server Action discovery ----------------------- */

const manifest = JSON.parse(readFileSync(path.join(DASHBOARD, ".next/server/server-reference-manifest.json"), "utf8"));
const actionIds = new Set(Object.keys(manifest.node));
function clientActionNames() {
  const names = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js")) {
        const s = readFileSync(p, "utf8");
        for (const m of s.matchAll(/"([0-9a-f]{40,44})"\s*,[^"]{0,200}?"([A-Za-z_$][\w$]*)"\)/g)) if (actionIds.has(m[1])) names[m[2]] = m[1];
      }
    }
  };
  walk(path.join(DASHBOARD, ".next/static"));
  return names;
}
// A decision's key from a page: an ?open= link, or the v5 page data ("key":"detector:…").
function findingKeyIn(html) {
  const link = /[?&;]open=([^&"]+)/.exec(html)?.[1];
  if (link) return decodeURIComponent(link);
  return /\\?"key\\?":\\?"([a-z_]+:[^"\\]+)\\?"/.exec(html)?.[1] ?? "";
}
const idsIn = (html) => new Set([...html.matchAll(/[0-9a-f]{40,44}/g)].map((m) => m[0]).filter((x) => actionIds.has(x)));

/* -------------------------------- database ------------------------------ */

async function inspect(fn) {
  await stop(dashboard);
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(path.join(dataDir, "pglite"));
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  try {
    await fn(q);
  } finally {
    await db.close();
  }
  await startDashboard();
}

/* --------------------------------- run ---------------------------------- */

async function main() {
  for (const p of [".next/server/server-reference-manifest.json"]) if (!existsSync(path.join(DASHBOARD, p))) throw new Error(`dashboard not built (${p})`);
  if (!existsSync(path.join(WEBSITE, ".output/server/index.mjs"))) throw new Error("website not built (.output/server/index.mjs)");
  for (const url of [`${A}/`, `http://localhost:${B_PORT}/`]) {
    const busy = await fetch(url).then(() => true, () => false);
    if (busy) throw new Error(`port already in use: ${url} (stop the local servers first)`);
  }
  await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  await startDashboard();
  const website = start("website", process.execPath, [".output/server/index.mjs"], WEBSITE, { PORT: String(A_PORT), HOST: "127.0.0.1" });
  await waitFor(`${A}/`);
  const names = clientActionNames();
  ok(names.signOut && names.setFindingStatus, "found the signOut and setFindingStatus Server Actions in the build");

  console.log("\n# Signed out");
  let r = await get("/app/c/x");
  ok(r.status === 307 && r.headers.get("location") === `${A}/home?next=%2Fapp%2Fc%2Fx`, "dashboard page -> website /home with a safe return path");
  ok((await get("/app/api/summary?ws=x")).status === 401, "dashboard API -> 401");

  console.log("\n# Sign-in bridge");
  ok((await bridge("POST", "other.e2e.sig")).status === 403 && !cookie, "signed-in non-owner is refused, no cookie");
  ok((await bridge("POST", "owner.e2e.sig", "https://evil.test")).status === 403 && !cookie, "bridge refuses a foreign origin");
  ok((await bridge("POST", "owner.e2e.sig")).status === 200 && !!cookie, "owner admitted, session cookie set");
  r = await get("/app");
  const ws = workspaceOf(r);
  ok(r.status === 307 && !!ws, "/app -> the owner's sample account");
  r = await get(`/app/c/${ws}`);
  const overview = await r.text();
  ok(r.status === 200 && overview.includes("Lotus Skincare (sample)"), "Overview renders through the proxy");

  // Server Actions referenced by the server-rendered pages.
  // v5 calls these from client components, so their ids come from the build.
  const resetId = names.loadSampleData ?? [...idsIn(overview)].filter((x) => !Object.values(names).includes(x))[0];
  ok(!!resetId, "found the reset-sample Server Action");
  const settingsHtml = await (await get(`/app/c/${ws}/settings`)).text();
  const settingsId = names.saveSettings ?? [...idsIn(settingsHtml)].filter((x) => x !== resetId && !Object.values(names).includes(x))[0];
  ok(!!settingsId, "found the save-settings Server Action");
  const actionsHtml = await (await get(`/app/c/${ws}/actions`)).text();
  const findingKey = findingKeyIn(actionsHtml);
  ok(!!findingKey, "found a decision on the Actions page");

  console.log("\n# Server Actions from a foreign origin are refused");
  for (const [label, id, args] of [
    ["sign-out", names.signOut, []],
    ["decision", names.setFindingStatus, [ws, findingKey, "done", "E2E", {}]],
    ["reset sample", resetId, []],
  ]) {
    const res = await action(`/app/c/${ws}`, id, args, "https://evil.test");
    ok(res.status >= 400 && !res.redirect, `${label} from https://evil.test is rejected (HTTP ${res.status})`);
  }
  ok(!!cookie && (await get(`/app/c/${ws}`)).status === 200, "the session survived the forged requests");

  console.log("\n# Server Actions through the website's /app proxy");
  r = await action(`/app/c/${ws}/actions`, names.setFindingStatus, [ws, findingKey, "done", "E2E decision", {}]);
  ok(r.status === 200 && !/Invalid Server Actions request/.test(r.text), "save a campaign decision (mark done)");
  const form = new FormData();
  for (const [k, v] of Object.entries({ name: "Lotus Skincare (sample)", currency: "USD", industry: "Beauty & retail", country: "Cambodia", "messages.target": "1.5", "messages.margin": "", "messages.close": "", "messages.profit": "" })) form.set(k, v);
  r = await action(`/app/c/${ws}/settings`, settingsId, [ws, form]);
  ok(r.status === 200 && !/Invalid Server Actions request/.test(r.text), "update targets and settings");

  console.log("\n# Sign out from the dashboard");
  r = await action(`/app/c/${ws}`, names.signOut, []);
  // Next.js answers an action's redirect with HTTP 200 + x-action-redirect.
  ok(r.status === 200 && r.redirect === `${A}/logout;push`, "sign-out accepted and continues to the website's /logout");
  ok(cookie === null, "dashboard session cookie cleared");
  ok((await get("/logout")).status === 200, "website /logout page is served (it ends the Supabase session in the browser)");
  r = await get(`/app/c/${ws}`);
  ok(r.status === 307 && (r.headers.get("location") ?? "").startsWith(`${A}/home`), "after sign-out the dashboard sends you to /home (then /login)");
  ok((await get("/app/api/summary?ws=x")).status === 401, "after sign-out the dashboard API answers 401");

  await inspect(async (q) => {
    console.log("\n# Database after sign-out");
    ok((await q("select count(*)::int n from sessions"))[0].n === 0, "no dashboard sessions left");
    ok((await q("select count(*)::int n from users where id = $1", [OTHER]))[0].n === 0, "the refused user created nothing");
    const rec = await q("select status from rec_status");
    ok(rec.length === 1 && rec[0].status === "done", "the decision was saved");
    const goal = await q("select target from goals where objective = 'messages'");
    ok(goal.length === 1 && goal[0].target === 1.5, "the target was saved");
  });

  console.log("\n# Signing in again");
  ok((await bridge("POST", "owner.e2e.sig")).status === 200, "owner signs in again");
  r = await get("/app");
  ok(workspaceOf(r) === ws, "same sample account, no second copy");
  ok((await get(`/app/c/${ws}`)).status === 200, "sample account still opens");

  console.log("\n# Reset the sample account");
  r = await action(`/app/c/${ws}`, resetId, []);
  const newWs = /\/c\/([0-9a-f-]{36})/.exec(r.redirect ?? "")?.[1];
  ok(r.status === 200 && r.redirect === `/c/${newWs};push` && !!newWs && newWs !== ws, "reset accepted and opens the fresh sample");
  ok(!!newWs && (await get(`/app/c/${newWs}`)).status === 200, "fresh sample opens");
  ok((await get(`/app/c/${ws}`)).status === 404, "the old sample account is gone");

  console.log("\n# Sign out from the website");
  ok((await bridge("DELETE", null, "https://evil.test")).status === 403 && !!cookie, "cross-site sign-out is refused");
  ok((await bridge("DELETE", null)).status === 200 && cookie === null, "website sign-out ends the dashboard session");
  ok((await get(`/app/c/${newWs}`)).status === 307, "no access after website sign-out");

  await inspect(async (q) => {
    console.log("\n# Database at the end");
    ok((await q("select count(*)::int n from sessions"))[0].n === 0, "no dashboard sessions left");
    const wss = await q("select id, is_sample from workspaces where owner_id = $1", [OWNER]);
    ok(wss.length === 1 && wss[0].id === newWs && wss[0].is_sample, "exactly one sample account (the fresh one)");
    ok((await q("select count(*)::int n from facts where workspace_id = $1", [newWs]))[0].n === 4320, "fresh sample has the original 4,320 daily rows");
    ok((await q("select count(*)::int n from rec_status"))[0].n === 0, "the old sample's decisions went with it");
  });

  await mvp(newWs, resetId);
  await stop(website);
}

/* --------------------- submission MVP: open registration ------------------ */

// A small Meta Ads Manager daily export (real column names), 3 campaigns x 28 days.
function metaExport() {
  const header = ["Campaign name", "Ad set name", "Day", "Objective", "Campaign delivery", "Result indicator", "Results", "Amount spent (USD)", "Impressions", "Reach", "Link clicks", "Purchases conversion value"];
  const campaigns = [
    ["E2E Leads | Spring offer", "Broad", "OUTCOME_LEADS", "actions:lead"],
    ["E2E Sales | Catalog", "Retargeting", "OUTCOME_SALES", "actions:offsite_conversion.fb_pixel_purchase"],
    ["E2E Traffic | Blog", "Interests", "OUTCOME_TRAFFIC", "actions:link_click"],
  ];
  const lines = [header.join(",")];
  let spend = 0;
  for (let d = 1; d <= 28; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    campaigns.forEach(([name, set, objective, indicator], i) => {
      const s = 20 + ((d + i) % 7) + i * 5;
      const impressions = 2000 + 50 * d + 300 * i;
      const clicks = 30 + d + 4 * i;
      const results = indicator === "actions:link_click" ? clicks : 3 + ((d + i) % 4);
      const value = indicator.includes("purchase") ? (results * 42.5).toFixed(2) : "";
      spend += s;
      lines.push([name, set, day, objective, "Active", indicator, results, s.toFixed(2), impressions, Math.round(impressions / 1.4), clicks, value].join(","));
    });
  }
  return { csv: lines.join("\n") + "\n", rows: lines.length - 1, spend };
}

async function upload(workspaceId, fileName, bytes) {
  const form = new FormData();
  form.set("workspaceId", workspaceId);
  form.set("file", new Blob([bytes]), fileName);
  const headers = { origin: A };
  if (cookie) headers.cookie = `admate_session=${cookie}`;
  const res = await fetch(`${A}/app/api/import/preview`, { method: "POST", headers, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function commit(body) {
  const headers = { origin: A, "content-type": "application/json" };
  if (cookie) headers.cookie = `admate_session=${cookie}`;
  const res = await fetch(`${A}/app/api/import/commit`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function signInAs(token) {
  cookie = null;
  const r = await bridge("POST", token);
  const home = await get("/app");
  return { status: r.status, workspace: workspaceOf(home) };
}

async function mvp(ownerSample, resetId) {
  console.log("\n=== Customer registration and private samples ===");
  accessMode = "open";
  await stop(dashboard);
  await startDashboard();
  cookie = null;
  const names = clientActionNames();

  const landing = await get("/");
  const landingHtml = await landing.text();
  ok(landing.status === 200 && landingHtml.includes('href="/login"') && !landingHtml.includes('href="/demo"'), "public homepage links to real sign-in and has no demo CTA");
  ok((await get("/login")).status === 200, "real sign-in page is available");
  const legacy = await get("/demo");
  const legacyTarget = new URL(legacy.headers.get("location") ?? "/", A);
  ok(legacy.status >= 300 && legacy.status < 400 && legacyTarget.origin === A && legacyTarget.pathname === "/home", "old website demo link redirects to the sign-in entry");
  ok((await get("/app/demo")).status === 307, "old dashboard demo link requires sign-in");
  ok((await get(`/app/c/${ownerSample}`)).status === 307, "visitor cannot open the owner's sample directly");
  for (const api of ["api/counts", "api/v5/daily", "api/v5/detail", "api/internal/public-demo"]) {
    const r = await fetch(`${A}/app/${api}?ws=${ownerSample}`, { headers: { "x-admate-public-demo": "1" } });
    ok(r.status === 401, `visitor cannot use /${api} with the old demo header`);
  }

  const a = await signInAs("a.e2e.sig");
  ok(a.status === 200 && !a.workspace, "customer A can sign up without a sample");
  const aCookie = cookie;
  const empty = await get("/app");
  const emptyHtml = await empty.text();
  const popup = /<form[^>]*class="brand-onboarding-form"[^>]*>([\s\S]*?)<\/form>/.exec(emptyHtml)?.[1] ?? "";
  ok(empty.status === 200 && emptyHtml.includes('role="dialog"') && emptyHtml.includes("Create your brand") && !emptyHtml.includes('aria-label="Pages"'), "first sign-in shows the required brand popup before the dashboard");
  ok(popup.includes('name="name"') && popup.includes('name="industry"') && !popup.includes('name="country"') && !popup.includes('name="currency"'), "the popup asks only for brand name and industry");
  ok((await get("/app/accounts/new")).status === 307, "a direct visit to the add-brand form cannot skip the popup");
  ok((await get("/app/demo")).status === 404, "signed-in customer cannot open the demo route");
  ok((await get(`/app/c/${ownerSample}`)).status === 404, "signed-in customer cannot open the owner's sample");
  const reset = await action("/app", resetId, []);
  ok(reset.redirect === "/;push" || reset.status === 404, "customer cannot load a sample with the owner's action id");

  const b = await signInAs("b.e2e.sig");
  ok(b.status === 200 && !b.workspace, "customer B can sign up without a sample");
  const bCookie = cookie;

  console.log("\n# Customer A creates an ad account and uploads their own report");
  cookie = aCookie;
  const fd = new FormData();
  fd.set("name", "E2E Skin Clinic");
  const createId = /\$ACTION_ID_([0-9a-f]{40,44})/.exec(popup)?.[1] ?? names.createWorkspace;
  if (!createId) throw new Error("Missing create brand action id");
  const missing = await action("/app", createId, [fd]);
  ok(missing.redirect === "/?brandError=industry;push", "the server refuses a first brand with no industry");
  const blank = new FormData();
  blank.set("name", "  ");
  blank.set("industry", "Beauty & retail");
  const invalid = await action("/app", createId, [blank]);
  ok(invalid.redirect === "/?brandError=name;push", "the server refuses a blank brand name");
  fd.set("industry", "Beauty & retail");
  const create = await action("/app", createId, [fd]);
  const own = /\/c\/([0-9a-f-]{36})/.exec(create.redirect ?? "")?.[1];
  ok(create.status === 200 && !!own && create.redirect === `/c/${own};push`, `new brand opens its own overview (HTTP ${create.status})`);
  if (!own) throw new Error("No workspace created");
  const brand = await get(`/app/c/${own}`);
  const brandHtml = await brand.text();
  ok(brand.status === 200 && brandHtml.includes("E2E Skin Clinic") && brandHtml.includes("No reports yet") && brandHtml.includes('aria-label="Pages"') && brandHtml.includes(`href="/app/c/${own}/upload"`), "new brand overview is empty and links to its uploader");
  ok((await get(`/app/c/${own}/upload`)).status === 200, "brand upload form is available");
  const fx = metaExport();
  const bad = await upload(own, "report.pdf", new TextEncoder().encode("%PDF-1.7"));
  ok(bad.status === 415 && /csv/.test(bad.body.error ?? ""), `unsupported file is refused with a clear message ("${bad.body.error}")`);
  const fake = await upload(own, "report.xlsx", new TextEncoder().encode(fx.csv));
  ok(fake.status === 415 && /valid .xlsx/.test(fake.body.error ?? ""), "a CSV renamed to .xlsx is refused");
  const p = await upload(own, "meta-september.csv", new TextEncoder().encode(fx.csv));
  ok(p.status === 200 && p.body.platform === "meta" && p.body.rowCount === fx.rows, `preview reads it as Meta, ${fx.rows} rows (got ${p.body.platform}, ${p.body.rowCount})`);
  const c = await commit({ uploadId: p.body.uploadId, workspaceId: own, platform: "meta", periodStart: p.body.period?.start, periodEnd: p.body.period?.end, objectives: {}, matches: {} });
  ok(c.status === 200 && !!c.body.importId, "import committed");
  const overview = await get(`/app/c/${own}`);
  const ownHtml = await overview.text();
  ok(overview.status === 200 && ownHtml.includes("E2E Skin Clinic") && !ownHtml.includes("You’re exploring a sample account"), "A's own account opens with its own data (not the sample)");
  ok((await get(`/app/c/${own}/campaigns`)).status === 200, "A's campaigns page renders the uploaded campaigns");
  cookie = bCookie;
  ok((await get(`/app/c/${own}`)).status === 404, "B can't open A's uploaded account");
  cookie = aCookie;

  console.log("\n# Persistence");
  ok((await bridge("DELETE", null)).status === 200 && cookie === null, "A signs out");
  const again = await signInAs("a.e2e.sig");
  ok(again.workspace === own && (await get(`/app/c/${own}`)).status === 200, "A's report is still available after signing in again");
  const owner = await signInAs("owner.e2e.sig");
  ok(owner.status === 200 && owner.workspace === ownerSample, "the verified owner still opens their sample");

  await inspect(async (q) => {
    console.log("\n# Database checks");
    const facts = await q("select count(*)::int n, round(sum(spend)::numeric, 2)::float s from facts where workspace_id = $1", [own]);
    ok(facts[0].n === fx.rows && Math.abs(facts[0].s - fx.spend) < 0.005, `uploaded rows and spend stored exactly (${facts[0].n} rows, $${facts[0].s} = file $${fx.spend})`);
    const [imp] = await q("select columns from imports where workspace_id = $1", [own]);
    const cols = imp.columns;
    ok(cols.includes("spend") && cols.includes("leads") && !cols.includes("installs") && !cols.includes("thruplays"), "measures missing from the file are recorded as missing, not zero");
    const [{ n: leakedSamples }] = await q("select count(*)::int n from workspaces where is_sample and owner_id <> $1", [OWNER]);
    ok(leakedSamples === 0, "registration and sample actions did not create non-owner samples");
    ok((await q("select count(*)::int n from workspaces where owner_id = $1 and not is_sample", [USER_A]))[0].n === 1, "A has only their uploaded account");
    ok((await q("select count(*)::int n from workspaces where owner_id = $1", [USER_B]))[0].n === 0, "B has no accounts until they create one");
  });

  console.log("\n# Limits");
  await signInAs("a.e2e.sig");
  let blocked = null;
  for (let i = 0; i < 6 && !blocked; i++) {
    const f = new FormData();
    f.set("name", `Account ${i}`);
    const res = await action(`/app/c/${own}/upload`, names.createWorkspaceForUpload, [f]);
    if (/up to 5 ad accounts/.test(res.text)) blocked = i;
  }
  ok(blocked === 4, `account limit: the 6th own account is refused (refused at attempt ${blocked})`);
  let limited = false;
  for (let i = 0; i < 22 && !limited; i++) limited = (await upload(own, "again.csv", new TextEncoder().encode(fx.csv))).status === 429;
  ok(limited, "upload limit: more than 20 uploads an hour are refused");

}

try {
  await main();
} catch (error) {
  failures++;
  console.log(`FAIL  ${error instanceof Error ? error.message : error}`);
  for (const c of children) if (/error/i.test(c.log)) console.log(`--- ${c.name} log (errors) ---\n${c.log.split("\n").filter((l) => /error|⨯|warn/i.test(l)).slice(0, 10).join("\n")}`);
} finally {
  for (const c of [...children]) await stop(c);
  mock.close();
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll end-to-end checks passed.");
process.exit(failures ? 1 : 0);
