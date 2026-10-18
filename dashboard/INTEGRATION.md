# AdMate integration of this dashboard

This folder is Project B (`Neat88/admate-app`) at commit
`690a8de76d06248be5c55fdf4c5bb93b23042e22`, brought into the AdMate website
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
| Mount | website `vite.config.ts` (Nitro route rules) | `/app` and `/app/**` go to this app's deployment when `ADMATE_DASHBOARD_ORIGIN` is set at build time. On Vercel this becomes an edge rewrite. |
| Base path | `next.config.ts` → `basePath: "/app"` (`lib/integration/paths.ts`) | Links, pages and assets live under `/app`. Raw `fetch()` calls to this app's API use `apiPath()`. |
| Server Actions | `next.config.ts` → `experimental.serverActions.allowedOrigins` | Requests arrive through the website's rewrite, so the browser's `Origin` (the public host) differs from the host this app sees. Exactly the host of `ADMATE_PUBLIC_ORIGIN` is allowed (with its port locally); Next.js still refuses every other origin. Read when the app starts. |
| Sign-in | website `/login` (Supabase email OTP) | Unchanged. There is no password sign-in or sign-up here any more. |
| Session bridge | website `/home` → `POST /app/api/session` | `/home` sends the Supabase access token (Authorization header, same origin). `app/api/session/route.ts` confirms it with Supabase Auth (`lib/auth/supabase.ts`), checks access (`lib/access/policy.ts`) and only then starts this app's own session (the original `startSession()`, HttpOnly cookie). On a user's first entry it creates their sample account with the original `createSampleAccount()`, as sign-up used to. |
| Access | `lib/access/policy.ts`, checked in `getCurrentUser()` on **every** protected request | `ADMATE_ACCESS=open` (submission MVP): every Supabase-verified user gets their own private workspace. Without it: owner only (`META_OWNER_USER_ID`, fail-closed). Later, invite-only Early Access: only an `active` entitlement keyed by the Supabase user id. Losing access ends the session on the next request. Refused users create no data here. Each user only ever sees accounts they own (the original `getWorkspace()` rule). |
| Public demo | `lib/integration/public-demo.ts`, `proxy.ts`, `app/demo/route.ts` | One shared copy of the original sample (original `createSampleAccount()`), owned by a system user that can never sign in. Signed-out READ requests marked by `proxy.ts` get a read-only visitor identity equal to that system user, so the original ownership rule shows them only the demo. Writes, Server Actions, uploads and AI never get it. The website's `/demo` lands on `/app/demo`: signed in → your own sample; otherwise → the public demo. |
| Demo refresh | `app/api/internal/public-demo/route.ts` | Needs `Authorization: Bearer $CRON_SECRET` (≥ 32 chars; off without it). Builds the next copy under the other system user and removes the old one only when the new one is complete. Never touches users' accounts. Not scheduled yet. |
| Upload limits | `lib/integration/limits.ts`, called from the import routes and account creation | 4 MB per file; real CSV/TSV/XLSX/XLS content (zip-bomb check for .xlsx); 20 uploads per user per hour; 5 own accounts per user; 50 active reports per account; 50,000 rows per file. |
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
| `next.config.ts` | modified | `basePath: "/app"`; Server Actions accept exactly the public host (`serverActions.allowedOrigins`) |
| `proxy.ts` | modified | Bridge is the only public endpoint; signed-out visitors go to the website's `/home` |
| `vercel.json` | modified | `buildCommand: "next build"` (no migrations during builds) |
| `.env.example` | modified | New integration settings (placeholders) |
| `lib/auth/session.ts` | modified | Per-request access check in `getCurrentUser()`; sign-in redirect goes to the website |
| `lib/auth/cookie.ts` | modified | Session lifetime 12 hours |
| `app/(auth)/actions.ts` | modified | Password sign-up and sign-in removed; sign-out continues to the website's `/logout` |
| `components/AccountNav.tsx` | modified | `fetch` path under `/app` (`apiPath`) |
| `components/AskPanel.tsx` | modified | `fetch` path under `/app` (`apiPath`) |
| `components/UploadFlow.tsx` | modified | `fetch` paths under `/app` (`apiPath`) |
| `app/(auth)/login/page.tsx` | deleted | Password sign-in replaced by the website's email OTP |
| `app/(auth)/signup/page.tsx` | deleted | Password sign-up replaced by invite-only Early Access |
| `app/(auth)/AuthForm.tsx` | deleted | Only used by the removed pages |
| `app/(auth)/AuthFrame.tsx` | deleted | Only used by the removed pages |
| `lib/auth/password.ts` | deleted | Only used by the removed sign-in |
| `INTEGRATION.md` | added | This file |
| `integration.lock.json` | added | Source commit file hashes |
| `scripts/check-integration.mjs` | added | Verifies the two files above |
| `lib/integration/paths.ts` | added | Base path, API paths, website URLs |
| `lib/auth/supabase.ts` | added | Supabase token check |
| `lib/access/policy.ts` | added | Who may use the dashboard |
| `app/api/session/route.ts` | added | Session bridge and sign-out |
| `tests/integration-session.test.ts` | added | Bridge, access, sign-out, request-gate and allowed-origin tests |
| `scripts/e2e-proxy.mjs` | added | End-to-end test through the website's `/app` proxy (local only) |
| `lib/integration/public-demo.ts` | added | Shared public demo: system owners, current demo, safe refresh, visitor identity |
| `lib/integration/read-only.tsx` | added | Read-only flag for visitors (what the screen offers) |
| `lib/integration/limits.ts` | added | Upload and account limits, file content checks |
| `app/demo/route.ts` | added | `/app/demo`: own sample or the public demo |
| `app/api/internal/public-demo/route.ts` | added | Secret-protected demo refresh |
| `app/actions.ts` | modified | Account limit before creating an account (2 calls) |
| `app/api/import/preview/route.ts` | modified | Signed-in owners only; file content, rate and row limits |
| `app/api/import/commit/route.ts` | modified | Signed-in owners only; report, file and row limits |
| `app/c/[ws]/layout.tsx` | modified | Sample banner shows the data date; visitors see public-demo wording and are sent to sign in for other accounts |
| `app/c/[ws]/upload/page.tsx` | modified | Visitors see "sign up to upload" instead of the upload form |
| `components/Shell.tsx` | modified | Visitor sidebar (sign-in link instead of accounts/reset/user menu); provides the read-only flag |
| `components/v3/DrawerClient.tsx` | modified | Visitors see "sign in to save decisions" instead of the decision buttons |
| `components/ObjectiveSelect.tsx` | modified | Disabled for visitors |
| `components/RoleSelect.tsx` | modified | Disabled for visitors |
| `components/SettingsForm.tsx` | modified | Read-only fields and a sign-in prompt for visitors |
| `components/UndoImportButton.tsx` | modified | Hidden for visitors |
| `components/DeleteClientButton.tsx` | modified | Hidden for visitors |

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
