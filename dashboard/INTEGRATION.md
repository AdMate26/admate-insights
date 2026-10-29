# AdMate integration of this dashboard

This folder is Project B (`Neat88/admate-app`) at commit
`7d96593e735fc08e0b7efec31fa2c7a11e132974` (2026-10-27; first brought in at
`690a8de`, see the merge logs at the end), brought into the AdMate website
repository (`Linna420/admate-insights`) unchanged except for the files listed
below. It is served at **www.admate.site/app**. The landing page, sign-in and
public pages stay on the website.

**The marketing analysis is untouched.** `lib/metrics`, `lib/analysis`,
`lib/sample`, `lib/ingest`, `lib/data`, `lib/db`, `lib/ai`, `drizzle/`, the
analysis pages under `app/c/[ws]` (overview, actions, campaigns, audience,
reports, settings), `components/v3/charts.tsx` and the other report components,
`app/globals.css` and the original tests are byte-identical to the source
commit. The few interface files listed below only hide write controls from
public demo visitors. Check with:

```bash
node scripts/check-integration.mjs   # every unlisted file matches the source commit
npx vitest run                       # original tests + integration tests
node scripts/e2e-proxy.mjs           # end-to-end through the website's /app proxy (see below)
```

`scripts/e2e-proxy.mjs` needs both apps built for localhost
(`ADMATE_PUBLIC_ORIGIN=http://localhost:3000 npx next build` here, and the website
with `ADMATE_DASHBOARD_ORIGIN=http://localhost:3100 NITRO_PRESET=node-server npx vite build`)
and free ports 3000, 3100 and 3400. It uses a fake Supabase Auth server and a
throwaway database; nothing real is contacted.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| Mount | website `vite.config.ts` (Nitro route rules) | `/app` and `/app/**` go to this app's deployment when `ADMATE_DASHBOARD_ORIGIN` is set at build time. On Vercel this becomes an edge rewrite, unless `ADMATE_DASHBOARD_BYPASS_SECRET` is set (see below). |
| Base path | `next.config.ts` → `basePath: "/app"` (`lib/integration/paths.ts`) | Links, pages and assets live under `/app`. Raw `fetch()` calls to this app's API use `apiPath()`. |
| Server Actions | `next.config.ts` → `experimental.serverActions.allowedOrigins` | Requests arrive through the website's rewrite, so the browser's `Origin` (the public host) differs from the host this app sees. Exactly the host of `ADMATE_PUBLIC_ORIGIN` is allowed (with its port locally); Next.js still refuses every other origin. Read when the app starts. |
| Sign-in | website `/login` (Supabase email OTP) | Unchanged. There is no password sign-in or sign-up here any more. |
| Session bridge | website `/home` → `POST /app/api/session` | `/home` sends the Supabase access token (Authorization header, same origin). `app/api/session/route.ts` confirms it with Supabase Auth (`lib/auth/supabase.ts`), checks access (`lib/access/policy.ts`) and only then starts this app's own session (the original `startSession()`, HttpOnly cookie). On a user's first entry it creates their sample account with the original `createSampleAccount()`, as sign-up used to. |
| Access | `lib/access/policy.ts`, checked in `getCurrentUser()` on **every** protected request | `ADMATE_ACCESS=open` (submission MVP): every Supabase-verified user gets their own private workspace. Without it: owner only (`META_OWNER_USER_ID`, fail-closed). Later, invite-only Early Access: only an `active` entitlement keyed by the Supabase user id. Losing access ends the session on the next request. Refused users create no data here. Each user only ever sees accounts they own (the original `getWorkspace()` rule). |
| Public demo | `lib/integration/public-demo.ts`, `proxy.ts`, `app/demo/route.ts` | One shared copy of the original sample (original `createSampleAccount()`), owned by a system user that can never sign in. Signed-out READ requests marked by `proxy.ts` get a read-only visitor identity equal to that system user, so the original ownership rule shows them only the demo. Writes, Server Actions, uploads and AI never get it. The website's `/demo` lands on `/app/demo`: signed in → your own sample; otherwise → the public demo. |
| Demo refresh | `app/api/internal/public-demo/route.ts` | Needs `Authorization: Bearer $CRON_SECRET` (≥ 32 chars; off without it). Builds the next copy under the other system user and removes the old one only when the new one is complete. Never touches users' accounts. Not scheduled yet. |
| Upload limits | `lib/integration/limits.ts`, called from the import routes and account creation | 4 MB per file; real CSV/TSV/XLSX/XLS content (zip-bomb check for .xlsx); 20 uploads per user per hour; 5 own accounts per user; 50 active uploaded reports per account (TikTok syncs don't count; they keep a rolling history, `lib/tiktok/history.ts`); 50,000 rows per file. |
| Session lifetime | `lib/auth/cookie.ts` | 12 hours (was 30 days). After that `/home` re-checks the Supabase sign-in. |
| Sign-out | dashboard "Sign out" → website `/logout`; website sign-out → `DELETE /app/api/session` | Either side ends both sessions. A new sign-in also ends any earlier session in the browser. |
| Signed-out visitors | `proxy.ts` | Pages redirect to the website's `/home?next=…`, which re-checks the sign-in and comes back. The API answers 401. |
| Builds | `vercel.json` → `"buildCommand": "next build"` | Vercel never runs `scripts/migrate.mjs` during a build. Migrations are a separate, deliberate step (`npm run db:migrate` with an explicit `DATABASE_URL`). |

Settings (see `.env.example`): `ADMATE_PUBLIC_ORIGIN`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` (the website's project; public values),
`META_OWNER_USER_ID`, `ADMATE_ACCESS` (`open` for the MVP) and `CRON_SECRET`
(demo refresh). Without `ADMATE_PUBLIC_ORIGIN` the bridge refuses to work.
Without `ADMATE_ACCESS=open` only the owner is admitted. Keep
`ANTHROPIC_API_KEY` unset: no report data goes to an AI provider.

Not wired yet: Live Meta data and the Live/Demo switch (after submission). If PostHog is ever
enabled, `instrumentation-client.ts` needs `api_host: "/app/ingest"`.

## Changed files

Everything not listed here is byte-identical to the source commit
(`integration.lock.json`).

| File | Change | Why |
| --- | --- | --- |
| `.env.example` | modified | New integration settings (placeholders); PostHog token/host wording; TikTok connection settings (names only) |
| `app/(auth)/actions.ts` | modified | Only sign-out remains (continues to the website's `/logout`); sign-in, sign-up, password reset and Google live on the website |
| `app/actions.ts` | modified | Account limit before creating an account (2 calls); `chooseLevel` uses the shared `levelTarget` |
| `app/api/import/commit/route.ts` | modified | Signed-in owners only; report, file and row limits (v5 Telegram-after-upload kept) |
| `app/api/import/preview/route.ts` | modified | Signed-in owners only; file content, rate and row limits |
| `app/c/[ws]/layout.tsx` | modified | v5 frame kept; visitors see public-demo wording and the data date, and are sent to the website's sign-in for other accounts; passes the read-only flag (`readOnly`, `ReadOnlyProvider`) |
| `README.md` | modified | Analytics paragraph matches the consent-first PostHog setup |
| `app/layout.tsx` | modified | Mounts the cookie banner and the page tracker (signed-in page views go through the server) |
| `app/v5-extra.css` | modified | Style for the visitor "Log in or sign up free" sidebar link and "Analytics settings" |
| `app/c/[ws]/upload/page.tsx` | modified | v5 page kept; visitors see "sign up to upload" instead of the upload form |
| `components/DeleteClientButton.tsx` | modified | Hidden for visitors |
| `components/SettingsForm.tsx` | modified | Read-only fields and a sign-in prompt for visitors |
| `components/UndoImportButton.tsx` | modified | Hidden for visitors |
| `components/UploadFlow.tsx` | modified | `fetch` paths under `/app` (`apiPath`); analytics gets reason codes and a fixed file-type list, never error text or file names |
| `components/v5/Assistant.tsx` | modified | `fetch` paths under `/app` (`apiPath`: ask, credits, checkout, test checkout); visitors get the sign-up note instead of a question |
| `components/v5/Drawer.tsx` | modified | `fetch` path under `/app` (`apiPath`) |
| `components/v5/Side.tsx` | modified | `fetch` path under `/app` (`apiPath`); visitor footer shows sign-up instead of sample reset and sign-out; Privacy and Terms links to the website's pages; analytics identifies by user ID and account email (after consent), "Analytics settings" link |
| `components/v5/TelegramPreview.tsx` | modified | `fetch` path under `/app` (`apiPath`) for the preview picture |
| `components/v5/ctx.tsx` | modified | `readOnly` flag and the visitor sign-up note (`nudge`) |
| `components/v5/page.tsx` | modified | `fetch` path under `/app` (`apiPath`); visitor decisions show on screen but are not saved; `recommendation_viewed` event, `analysis_viewed` for demo visitors (signed-in: server) |
| `drizzle/meta/_journal.json` | modified | Adds `0011_user_visits`, `0012_tiktok_connections`, `0013_tiktok_syncs`, `0014_tiktok_sync_imports` and `0015_tiktok_sync_summary` |
| `lib/data/imports.ts` | modified | Undo of an older report hands what it replaced to a newer import that would have replaced it (no double counting); undoing the newest report is unchanged; TikTok sync history still counts as a newer import there. TikTok syncs replace narrowly (`syncScope`): only the same campaign and day; uploads keep their rule; `onCommit` hook inside the transaction; imports and undos of one account are serialized with a row lock on the account (no double counting under concurrent transactions) |
| `lib/analysis/viewModel.ts` | modified | Dashboard rows show reach, frequency, results and revenue as unavailable (null, "—") when the data lacks them or reach was added up; the analysis engine is unchanged |
| `lib/analysis/alerts.ts` | modified | Treats an unavailable result count as 0 for its volume check (as before) |
| `components/v5/views/audience.tsx` | modified | Adds up possibly-unavailable results and revenue as 0 (as before) |
| `components/v5/views/budget.tsx` | modified | Adds up possibly-unavailable results and revenue as 0 (as before) |
| `components/v5/views/overview.tsx` | modified | Chart goal ignores unavailable result counts; sales wording in the account's currency (`f.back`) instead of a fixed "$" |
| `lib/fmt5.ts` | modified | `back` and `one` for sales-per-unit wording in the account's currency (USD text unchanged) |
| `app/c/[ws]/reports/page.tsx` | modified | Upload count excludes TikTok syncs; older syncs (history) shown as one "TikTok sync history" line |
| `lib/ingest/normalize.ts` | modified | Exports `objectiveFromPlatformText` and `objectiveFromMetrics` for the TikTok sync (no behavior change) |
| `components/v5/views/alerts.tsx` | modified | `fetch` path under `/app` (`apiPath`); visitor changes show the sign-up note instead of saving; `telegram_connected` event |
| `instrumentation-client.ts` | modified | PostHog starts only after consent (`lib/analytics.ts`) |
| `lib/analytics.ts` | modified | Cookie-consent PostHog in the browser: no replay/autocapture, privacy filter; page views only for demo visitors (`trackPageview`) |
| `lib/db/schema.ts` | modified | `user_visits` table (current visit per signed-in person, for analytics); TikTok tables `tiktok_connections`, `tiktok_oauth_states`, `tiktok_advertiser_links`, `tiktok_syncs` (with lock token), `tiktok_sync_imports` |
| `components/v5/views/campaigns.tsx` | modified | Visitors get the sign-up note instead of changing a goal or funnel role; skips comparisons that need an unavailable result count or revenue; sales wording in the account's currency |
| `components/v5/views/explorer.tsx` | modified | Visitors get the sign-up note instead of saving a view; a group's results subtotal is unavailable when any row's is |
| `lib/auth/cookie.ts` | modified | Session lifetime 12 hours |
| `lib/auth/session.ts` | modified | Per-request access check in `getCurrentUser()`; sign-in redirect goes to the website |
| `lib/telegram.ts` | modified | Message buttons open `ADMATE_PUBLIC_ORIGIN` + `/app` (the website), not this app's protected deployment address |
| `lib/levels.ts` | modified | `levelTarget` (shared by the server action and the visitor path) and the visitor view cookie name |
| `next.config.ts` | modified | `basePath: "/app"`; Server Actions accept exactly the public host (`serverActions.allowedOrigins`); `/ingest` analytics relay removed |
| `proxy.ts` | modified | Public: session bridge, demo refresh, `/api/cron` (own secret). Visitor read-only mark on demo pages incl. v5 Portfolio/Explorer/Budget/Geography/Report and `/api/v5/*`; signed-out visitors go to the website's `/home` |
| `vercel.json` | modified | `buildCommand: "next build"` (no migrations during builds) |
| `.claude/launch.json` | deleted | Local tool config, not needed in this repository |
| `app/(auth)/AuthForm.tsx` | deleted | Only used by the removed pages |
| `app/(auth)/AuthFrame.tsx` | deleted | Only used by the removed pages |
| `app/(auth)/ResetForms.tsx` | deleted | Password reset lives on the website (Supabase) |
| `app/(auth)/forgot-password/page.tsx` | deleted | Password reset lives on the website (Supabase) |
| `app/(auth)/login/page.tsx` | deleted | Sign-in lives on the website (Supabase email code and Google) |
| `app/(auth)/reset-password/page.tsx` | deleted | Password reset lives on the website (Supabase) |
| `app/(auth)/signup/page.tsx` | deleted | Sign-up lives on the website (Supabase email code and Google) |
| `app/api/auth/google/callback/route.ts` | deleted | Google sign-in lives on the website (Supabase) |
| `app/api/auth/google/route.ts` | deleted | Google sign-in lives on the website (Supabase) |
| `lib/auth/google.ts` | deleted | Google sign-in lives on the website (Supabase) |
| `lib/auth/next.ts` | deleted | Only used by the removed Google sign-in |
| `lib/auth/password.ts` | deleted | Only used by the removed sign-in |
| `lib/auth/reset.ts` | deleted | Password reset lives on the website (Supabase) |
| `lib/auth/site.ts` | deleted | Only used by the removed Google sign-in |
| `lib/email.ts` | deleted | Only used by the removed password reset |
| `tests/auth.test.ts` | deleted | Tests the removed password reset and Google sign-in |
| `INTEGRATION.md` | added | This file |
| `TIKTOK-CONNECTION.md` | added | TikTok connection: flow, tokens, tables, settings, steps before a real connection |
| `app/api/internal/public-demo/route.ts` | added | Secret-protected demo refresh |
| `app/api/activity/route.ts` | added | Signed-in page views and page leaves for analytics (server-side, no tracking cookie) |
| `app/api/tiktok/advertisers/route.ts` | added | TikTok: authorized advertisers (read-only, live) and links to the person's own ad accounts |
| `app/api/tiktok/connection/route.ts` | added | TikTok: connection status and disconnect |
| `app/api/tiktok/oauth/callback/route.ts` | added | TikTok: OAuth callback (one-use state, same session) |
| `app/api/tiktok/oauth/start/route.ts` | added | TikTok: starts OAuth with PKCE |
| `app/api/tiktok/sync/route.ts` | added | TikTok: Sync Now. POST checks and locks, answers 202, and runs the sync in the background (`after`, `maxDuration` 300). GET returns the last outcome for polling (counts and dates only). |
| `app/api/session/route.ts` | added | Session bridge and sign-out (reports a first entry; records `signup_completed` server-side) |
| `app/demo/route.ts` | added | `/app/demo`: own sample or the public demo |
| `app/connect/tiktok/page.tsx` | added | TikTok connection test page (404 unless enabled and allowlisted) |
| `app/connect/tiktok/ui.tsx` | added | TikTok connection test page controls |
| `components/AnalyticsConsent.tsx` | added | Cookie banner for analytics (shared with the website) |
| `components/PageTracker.tsx` | added | Page views: server for signed-in people, browser (after consent) for demo visitors |
| `drizzle/0012_tiktok_connections.sql` | added | Migration for the TikTok tables (new tables only; not applied anywhere yet) |
| `drizzle/meta/0012_snapshot.json` | added | Drizzle snapshot for 0012 |
| `drizzle/0013_tiktok_syncs.sql` | added | Migration for the Sync Now lock and last-sync state (new table only; local database only) |
| `drizzle/meta/0013_snapshot.json` | added | Drizzle snapshot for 0013 |
| `drizzle/0014_tiktok_sync_imports.sql` | added | Sync imports table and sync lock token (local database only) |
| `drizzle/meta/0014_snapshot.json` | added | Drizzle snapshot for 0014 |
| `drizzle/0015_tiktok_sync_summary.sql` | added | Adds `tiktok_syncs.summary` for the Sync Now status poll (local database only) |
| `drizzle/meta/0015_snapshot.json` | added | Drizzle snapshot for 0015 |
| `TIKTOK-STAGING-PLAN.md` | added | Phase 7 plan for hosted multi-user staging (not set up): architecture, settings, TikTok staging client, isolation, migrations, tests, costs, risks, approval gates |
| `TIKTOK-SYNC-PLAN.md` | added | Phase 5 audit, fixes, capacity design and the plan for daily sync, reminders and hosted testing |
| `drizzle/0011_user_visits.sql` | added | Migration for `user_visits` (apply to the dashboard database before go-live) |
| `drizzle/meta/0011_snapshot.json` | added | Drizzle snapshot for 0011 |
| `integration.lock.json` | added | Source commit file hashes |
| `lib/access/policy.ts` | added | Who may use the dashboard |
| `lib/analytics-sanitize.ts` | added | Privacy filter for analytics events (identical to the website's) |
| `lib/analytics-server.ts` | added | Server-side analytics for signed-in people: visits, PostHog capture through the privacy filter |
| `lib/tiktok/config.ts` | added | TikTok: off-by-default settings, tester allowlist, exact callback URL |
| `lib/tiktok/crypto.ts` | added | TikTok: PKCE and AES-256-GCM token encryption bound to person and purpose |
| `lib/tiktok/http.ts` | added | TikTok: request guard (feature, session, allowlist, same site) and fixed error codes |
| `lib/tiktok/mcp.ts` | added | TikTok: read-only MCP client (three allowed tools, never `tool_execute`) and advertiser listing |
| `lib/tiktok/oauth.ts` | added | TikTok: OAuth discovery, code exchange, refresh, revocation |
| `lib/tiktok/report.ts` | added | TikTok: fixed read-only campaign-by-day report, pagination, metric mapping (unavailable, never zero) |
| `lib/tiktok/service.ts` | added | TikTok: connect, status, single-flight token refresh with rotation, disconnect, advertiser links (own real account, same currency) |
| `lib/tiktok/store.ts` | added | TikTok: per-person database access, sync lock |
| `lib/tiktok/sync.ts` | added | TikTok: Sync Now (re-checks, lock, empty-report and rerun protection, one-transaction import with history consolidation) |
| `lib/tiktok/history.ts` | added | TikTok: rolling sync history (7 newest syncs undoable, older ones kept as history; unreachable undo copies pruned) |
| `lib/auth/supabase.ts` | added | Supabase token check (also returns the sign-in provider for sign-up analytics) |
| `lib/integration/limits.ts` | added | Upload and account limits, file content checks; the report limit counts uploads only (not TikTok syncs) |
| `lib/integration/paths.ts` | added | Base path, API paths, website URLs |
| `lib/integration/public-demo.ts` | added | Shared public demo: system owners, current demo, safe refresh, visitor identity |
| `lib/integration/read-only.tsx` | added | Read-only flag for visitors (what the screen offers) |
| `scripts/check-integration.mjs` | added | Verifies the two files above |
| `scripts/e2e-proxy.mjs` | added | End-to-end test through the website's `/app` proxy (local only) |
| `tests/tiktok-connection.test.ts` | added | TikTok: access control, replay, session mismatch, rotation, isolation, disconnect, Sync Now with simulated reports, rolling history, and concurrent upload, undo and sync (optionally against a real throwaway Postgres via `ADMATE_TEST_DATABASE_URL`) |
| `tests/tiktok-oauth.test.ts` | added | TikTok: OAuth and encryption primitives |
| `tests/analytics-server.test.ts` | added | Server-side analytics: sign-up, visits, cleaned paths, denial cases |
| `tests/analytics.test.ts` | added | Analytics privacy filter cases for dashboard events |
| `tests/integration-session.test.ts` | added | Bridge, access, sign-out, request-gate and allowed-origin tests |

## Verification record (2026-10-18, local, before the first push)

| Check | Result |
| --- | --- |
| `node scripts/check-integration.mjs` | 130 of 157 original files byte-identical to 690a8de; every other change listed above |
| `npx vitest run` | 100 passed, 3 skipped (the original 71 tests + 29 integration tests; the 3 skips are the same as at 690a8de) |
| Golden outputs (raw sample rows, pure engine, `createSampleAccount()` → `loadAnalysis()`), 29 files | SHA-256 identical to 690a8de |
| Sample created through the session bridge, and the public demo viewed as a visitor | 0 differences from 690a8de across 5 period selections |
| `node scripts/e2e-proxy.mjs` (through the website's `/app` proxy, fake Supabase, throwaway database) | 92 of 92 checks: sign-in bridge, Server Actions, sign-out from both sides, public demo read-only (incl. forged requests), two users isolated, real Meta CSV upload (rows and spend exact; missing measures recorded as missing), limits, sample reset and demo refresh leave uploads intact |
| Negative check | With the Server Action origin fix removed, exactly the 12 Server Action checks fail |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | Clean |
| Website (repository root) | 128 tests pass; lint and type check identical to `main` apart from the usual `bun:test` types in the new test; build without `ADMATE_DASHBOARD_ORIGIN` has no `/app` routes; landing, login, Supabase client, Meta and Telegram files unchanged against `main` |
| Real sign-in on localhost (owner, email code) | Refused while not authorised (no data created); admitted when authorised; dashboard, navigation, refresh and back worked; sign-out from the dashboard ended both sessions |

## Dashboard behind Vercel Authentication (2026-10-18)

The dashboard's Vercel project keeps Vercel Authentication on until launch. The
website reaches it with the dashboard project's "Protection Bypass for
Automation" secret, set on the **website** project as the sensitive variable
`ADMATE_DASHBOARD_BYPASS_SECRET` (never in code, URLs or chat). With it set, the
`/app` route rules send `x-vercel-protection-bypass` as a request header, which
makes Nitro proxy from the website's server function instead of an edge rewrite
(a rewrite cannot add request headers). Without it, the edge rewrite is used.

Website Production builds additionally refuse to build unless they come from
`main` and `ADMATE_DASHBOARD_ORIGIN` is an https origin
(`src/lib/production-guard.ts`).

Checked locally: unit tests (136); a Vercel-preset build with a made-up secret
has no `/app` edge rewrite, and the secret is absent from `config.json` and from
every browser file (present only in the server function); the full end-to-end
proxy run passed with the secret set; against a stand-in that answers 401
without the header, `/app` GET and a 1 MB POST went through, a browser-supplied
bypass header was overridden, and the secret appeared in no response or log.

## v5 dashboard merge (2026-10-25)

Brought the teammate's v5 work (Neat88/admate-app `2c8b653`, 11 commits after
`690a8de`) into `dashboard/` with a file-by-file three-way merge. Her screens,
analysis and data code are taken as written (169 of 213 files byte-identical).
Kept from the integration: website sign-in and the session bridge, the `/app`
base path (`apiPath` for her five new `fetch` calls), the public demo read-only
rules (now also covering Portfolio, Explorer, Budget and `/api/v5/*` reads),
upload and account limits. Removed: her own password, reset and Google sign-in
(the website already does this through Supabase). Her per-user Telegram alerts
are included but stay off until the dashboard gets its own `TELEGRAM_BOT_TOKEN`
and the `/api/cron/alerts` trigger is set up.

Public demo visitors: her screens had no read-only mode, so choosing a view or
any save crashed the demo page (a visitor's Server Action is sent to sign-in).
Now the v5 frame passes `readOnly`; a visitor's view is kept in a browser
cookie (`admate_demo_view`), decisions show on screen without being saved, and
other changes (goals, funnel roles, Explorer views, alerts, the Assistant) show
a "Sign up free" note. The server still refuses every visitor write.

Database: migrations 0006-0009 add nine tables (no existing table changes).
They must be applied to the dashboard database before this code goes live.

Checked locally: `next build`, `tsc --noEmit` (clean), `vitest` 119 passed / 3
skipped, `scripts/check-integration.mjs` (passes), and `scripts/e2e-proxy.mjs`
92 of 92 checks through the website's `/app` proxy (the script now reads the
reset/settings action ids from the build and finds decision keys in v5 page
data).

## Calm v5 update (2026-10-27)

Brought Neat88/admate-app `2c8b653` → `7d96593` (her 4 commits of 2026-10-27:
calmer v5 design with Advanced only, Madgicx-style dates, Geography, the
Performance report with PDF, Telegram alerts as pictures, AdMate Assistant with
beta credits) into `dashboard/`. 44 of her 49 changed files applied as written;
the other 5 were merged by hand:

- `app/c/[ws]/layout.tsx`, `components/v5/Drawer.tsx`: her change applied, the
  integration changes kept.
- `components/v5/Assistant.tsx`: her credits version, with `apiPath` for the new
  credits, checkout and test-checkout calls.
- `components/v5/Side.tsx`: her sidebar without the view picker, the visitor
  footer kept, plus Privacy and Terms links.
- `lib/data/settings.ts`: her version as written. Everyone has the Advanced view,
  so the visitor view cookie is no longer read (now byte-identical).

Also: `TelegramPreview.tsx` uses `apiPath`; `lib/telegram.ts` buttons point at the
website's `/app`; `proxy.ts` lets demo visitors read Geography and Report.

Switches (all off unless set): `ADMATE_ASK_ENABLED=true` plus `ANTHROPIC_API_KEY`
turns on the Assistant (report data then goes to Anthropic). `ADMATE_TEST_PAYMENTS`
must never be set in Production: with it on, anyone signed in can add credits
for free. Buying credits with real money does not exist yet.

Database: migration `0010_ai_credits` adds two tables (`credit_ledger`,
`credit_purchases`) and two columns with defaults to `ai_usage`. No existing data
changes. Apply it to the dashboard database before this code goes live.


Checked locally: `next build` and `tsc --noEmit` (clean), `vitest` 129 passed / 3
skipped, `scripts/check-integration.mjs` (passes: 187 of 232 files byte-identical
to `7d96593`), and `scripts/e2e-proxy.mjs` 102 of 102 checks (now also: the demo's
Alerts, Portfolio, Explorer, Budget, Geography and Report pages render for
visitors; visitors can't reach credits, checkout, test checkout or the Telegram
picture).
