# TikTok hosted multi-user staging: proposed plan (Phase 7)

Status 2026-10-29: **plan only.** Nothing in this document has been created,
registered, migrated or deployed. Each numbered gate in §7 needs explicit
approval. Automatic scheduling stays off and is not part of staging.

## 0. Decisions and verified facts (2026-10-29, after review)

**Decisions:**
- **G0:** approved and done (below).
- **G1:** option A (a separate staging Supabase), with the names `staging/tiktok`,
  `admate-tiktok-staging` and `admate-tiktok-dashboard-staging`.
- **G2–G10:** pending.

**G0 result:**
- On `admate-insights`:
  - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` now have target Production only;
    the Preview target was removed from the shared record.
  - The separate Preview-only `META_ACCESS_TOKEN` record was deleted. The
    Production record is untouched.
- No values were displayed and no redeploy happened. www.admate.site answered
  normally afterwards.
- Preview deployments built **before** the change keep the old values: at least
  20 in the last 5 days. All of them are behind Vercel Authentication (an
  anonymous request is redirected to Vercel's login).
- Full clean-up is optional and needs separate approval. Either delete those
  preview deployments, or rotate the Telegram bot token and the Meta token. A
  rotation also means updating Production.
- `META_AD_ACCOUNT_ID` and `META_OWNER_USER_ID` (identifiers, not secrets) are
  still in Preview. They are harmless without the token; they can be removed too.

**Verified facts:**
- **Supabase** ([pricing](https://supabase.com/pricing)): the Free plan allows 2
  active projects. Your only organization, "AdMate", is on Free with 2 projects,
  so there is no free slot.
  - Pro costs $25 per **organization** per month and includes $10 of compute
    credit, which covers one Micro project ($10). Each extra project adds $10.
  - **Option A cost:** a new organization "AdMate Staging" on Pro with one
    project is about **$25/month** plus tax.
  - Upgrading the existing "AdMate" organization instead would cost
    $25 + 3 × $10 − $10 = $45/month and put production on paid billing, so it is
    not recommended.
- **Email for logins.** The website signs people in with email codes
  (`signInWithOtp`). Supabase's built-in email
  ([docs](https://supabase.com/docs/guides/auth/auth-smtp)) delivers only to
  members of the project's team, at 2 emails an hour. Staging therefore needs
  custom email.
  - Production already uses **Resend** (`smtp.resend.com`, sender domain
    `admate.site`).
  - Staging should use a **new, separate Resend API key** on the same account
    ($0). Never the production key.
  - The Resend Free plan ([pricing](https://resend.com/pricing)) gives 100 emails
    a day and 3,000 a month, **shared with production's emails**.
- **Neon Free** ([pricing](https://neon.com/pricing)): 100 projects, 100
  compute-hours per project per month, 1 GB per project (20 GB in total), 10
  branches, 5 GB of transfer. It scales to zero after 5 minutes. Hitting a limit
  suspends or blocks writes; it never deletes data. Cost $0.
- **Vercel Hobby and commercial use** ([fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)):
  Hobby is restricted to non-commercial, personal use. Any deployment used for
  someone's financial gain, including asking for payment, counts as commercial
  and needs Pro ($20 per developer seat per month). AdMate is a SaaS with paid AI
  credits, so this applies to **production already**. Staging adds no new kind of
  use. I recommend moving to Pro before charging customers or launching publicly.
  This is your decision; staging itself works on Hobby.
- **The 4-minute sync on Vercel** ([duration](https://vercel.com/docs/functions/configuring-functions/duration)):
  - With Fluid compute, Hobby functions run for up to 300 s by default.
    `admate-insights` and `admate-dashboard` both have Fluid on; new projects
    have it by default, which G6 must confirm.
  - A sync passes through two functions: the website relay, which waits for the
    dashboard, and the dashboard itself. Node's default 300 s wait for response
    headers also applies.
  - So the current 240 s read budget fits, but with under a minute to spare.
    **Recommendation (a small code change before G8):** set
    `export const maxDuration = 300` on the sync route and lower the hosted read
    budget to 180 s.
  - Also set the function region to `sin1` (Singapore) on both staging projects,
    next to Neon. Production functions run in `iad1` (US East).
- **Staging's dependencies on production Supabase:**
  - **Website:** sign-in only calls Supabase Auth (email code, code check,
    session, sign-out, password reset). The only table it reads is `profiles`
    (`src/lib/auth/profile.ts`). The other table code (`telegram_schedules`)
    needs the service key, which staging never has, so it fails closed.
  - **Dashboard:** it uses Supabase only to check sign-in tokens
    (`/auth/v1/user`).
  - So the staging Supabase needs only the `profiles` migration, Auth with custom
    email, and no other production tables.
  - One requirement: sign-ups must be closed in staging Auth, because the website
    asks Supabase to create users on first sign-in (`shouldCreateUser: true`).
    With sign-ups closed, uninvited addresses are refused.
- **Staging addresses:** `admate-tiktok-staging.vercel.app` and
  `admate-tiktok-dashboard-staging.vercel.app` are unused today: they return
  `DEPLOYMENT_NOT_FOUND`. Vercel lets any plan point a domain at a Git branch.
  Meta staging points its `vercel.app` addresses at builds manually, so automatic
  branch assignment of a `vercel.app` address hasn't been tested in this team.
  - **Order:**
    1. G6 creates the projects.
    2. Confirm both addresses belong to our projects.
    3. Try branch assignment; the fallback is a manual `vercel alias set` after
       each staging deployment.
    4. Only then G7 (TikTok client).

## 1. Current architecture (reviewed read-only)

| Piece | Production today |
| --- | --- |
| Website | Vercel project `admate-insights` (team `ad-mate`, **Hobby**), `www.admate.site`, built from `main` only (`src/lib/production-guard.ts`) |
| Dashboard | Vercel project `admate-dashboard`, root `dashboard/`, behind Vercel Authentication. The website reaches it server-side through `/app` (`ADMATE_DASHBOARD_ORIGIN` plus a bypass secret). All its settings are Production-only. |
| Sign-in and website data | Supabase project **AdMate** (`xlnrvznupefeaqrsoefv`): Auth (email and Google), `profiles`, demo tables, Telegram schedules and cron, Meta data |
| Dashboard data | Supabase project **admate-dashboard** (`rstvgdtx…`): Data API off, migrations `0000`–`0011` applied by hand |
| Cloud Run | `admate-web` (GCP free trial): website plus dashboard in one container, same dashboard database through role `admate_cloudrun` |
| Meta staging (separate work) | Vercel projects `admate-meta-staging` and `admate-meta-dashboard-staging` (settings Preview-only, not deployed yet as of its notes). Neon Free project `admate-meta-staging` (Singapore) with a restricted runtime role. Sign-in reuses production Supabase Auth. |

**Existing risk found during the review (independent of TikTok).** Every Preview
build of the production website project receives production secrets:
- `META_ACCESS_TOKEN`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- `META_AD_ACCOUNT_ID` and `META_OWNER_USER_ID`
- the production Supabase URL and key

All of these are scoped to Preview as well as Production. Previews sit behind
Vercel Authentication, but any branch's code runs with them. That includes
PR #39's previews.

Recommendation: remove the Preview scope from the Meta and Telegram secrets
(separate approval, gate G0). Also: the Meta staging dashboard project holds an
`ANTHROPIC_API_KEY` in its Production scope. I noticed this and did not touch it.

## 2. Proposed staging architecture

```
Testers' browsers
   │  https://admate-tiktok-staging.vercel.app  (public URL, invite-only sign-in)
   ▼
Vercel project admate-tiktok-staging  (website, Preview of branch staging/tiktok)
   │  server-side /app proxy + bypass secret
   ▼
Vercel project admate-tiktok-dashboard-staging  (dashboard, Vercel Authentication ON)
   │                                 │
   ▼                                 ▼
Neon Free "admate-tiktok-staging"     TikTok MCP (read-only tools), staging OAuth client
(dashboard tables, restricted role)
Sign-in: Supabase project "admate-staging" (Auth + profiles only, sign-ups closed, invite-only)
```

**Why each choice:**
- **Separate Vercel projects**, not Previews of the production projects, because
  those Previews carry production secrets (§1). Every setting is scoped to Preview
  on the branch `staging/tiktok`. An "Ignored Build Step" builds only that branch,
  so pushes to `main` or other PRs never build there.
- **A dedicated branch `staging/tiktok`**, cut from PR #39's head. Staging changes
  only when that branch is moved on purpose. PR #39 stays a draft and unmerged.
- **Stable domains `admate-tiktok-staging.vercel.app` and
  `admate-tiktok-dashboard-staging.vercel.app`**, each assigned to the branch in
  Vercel's Domains settings. They need no DNS change, never share cookies with
  `admate.site`, and are obviously not production. The TikTok callback is fixed
  on the website domain. (`staging.admate.site` is possible later through a
  Namecheap CNAME. The session cookie is host-only, so it would be isolated too.)
- **Website protection off, dashboard protection on.** On Hobby, testers can't
  pass Vercel Authentication: there are no team seats. So:
  - the staging website is reachable, but sign-in is invite-only
  - the dashboard stays private behind the website proxy, as in production
- **Sign-in on a separate Supabase project (recommended, option A).** Production
  Auth, profiles and users are never touched:
  - New sign-ups are **disabled**, and testers are invited by email.
  - Google sign-in stays off; email and password, or a magic link, only.
  - Only the `profiles` migration (`supabase/migrations/20260903071150_…sql`) is
    applied. It is all the website needs.

  Option B (as Meta staging does) reuses production Auth with the public key. It
  costs nothing, but sign-ins write sessions into production Auth, staging code
  receives testers' production tokens, and a sign-up on staging would create a
  real production account. With B, keep `ADMATE_ACCESS` closed and do not use B
  for anyone but you.
- **Dashboard data on Neon Free** (separate from Meta's Neon project). There's
  no Data API at all. The runtime role can only read and write rows, and the
  migration owner's URL never goes to Vercel.

## 3. Exact settings (names and sources only; values are entered privately)

**`admate-tiktok-staging`** (website):
- **Project settings:** root directory `.`; framework settings copied from
  `admate-insights`; production branch left as `main`.
- **Ignored Build Step:**
  `[ "$VERCEL_GIT_COMMIT_REF" = "staging/tiktok" ] && exit 1 || exit 0`
- **Protection:** Vercel Authentication **off**.

| Variable | Scope | Value from |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Preview (`staging/tiktok`) | staging Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Preview (`staging/tiktok`) | staging Supabase publishable key (public) |
| `ADMATE_DASHBOARD_ORIGIN` | Preview (`staging/tiktok`) | `https://admate-tiktok-dashboard-staging.vercel.app` |
| `ADMATE_DASHBOARD_BYPASS_SECRET` | Preview (`staging/tiktok`), **Sensitive** | the staging dashboard project's "Protection Bypass for Automation" |

**Never set here:**
- `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`
- any `META_*` or `TELEGRAM_*`
- any `LOVABLE_*`
- `VITE_POSTHOG_*`

**`admate-tiktok-dashboard-staging`** (dashboard):
- **Project settings:** root `dashboard`; build `next build` from
  `dashboard/vercel.json`, so no migrations run during builds.
- **Ignored Build Step:** the same command as the website.
- **Protection:** Vercel Authentication **on**, plus Protection Bypass for
  Automation.

| Variable | Scope | Value from |
| --- | --- | --- |
| `DATABASE_URL` | Preview (`staging/tiktok`), **Sensitive** | Neon **pooled** URL of the restricted runtime role |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Preview (`staging/tiktok`) | staging Supabase project |
| `ADMATE_PUBLIC_ORIGIN` | Preview (`staging/tiktok`) | `https://admate-tiktok-staging.vercel.app` |
| `ADMATE_ACCESS` | Preview (`staging/tiktok`) | `open`. Safe only with option A, because sign-in is invite-only. With option B leave it unset, so only the owner gets in. |
| `TIKTOK_CONNECT_ENABLED` | Preview (`staging/tiktok`) | `true` |
| `TIKTOK_CONNECT_ALLOWED_USER_IDS` | Preview (`staging/tiktok`) | the 2–3 testers' **staging** user IDs |
| `TIKTOK_MCP_CLIENT_ID` | Preview (`staging/tiktok`) | from the staging client registration (§4) |
| `TIKTOK_CONNECT_ENCRYPTION_KEY` | Preview (`staging/tiktok`), **Sensitive** | new 32 random bytes, generated and stored without display; never reused from local |

**Never set here:**
- `ANTHROPIC_API_KEY`, `ADMATE_ASK_ENABLED` and `ADMATE_MODEL` (the Assistant
  stays off)
- `NEXT_PUBLIC_POSTHOG_*`
- `TELEGRAM_BOT_TOKEN`, `CRON_SECRET` and `META_OWNER_USER_ID`
- any automatic-sync switch (none exists)

**Neon `admate-tiktok-staging`** (Free, AWS Singapore):
1. Apply migrations `0000`–`0015` once, with the owner's direct URL entered
   privately. Use `scripts/migrate.mjs`; it's the same migrator the app uses.
2. Create the runtime role, then hand its pooled URL to Vercel:
   ```sql
   create role admate_runtime login password '<generated, never shown>';
   grant usage on schema public to admate_runtime;
   grant select, insert, update, delete on all tables in schema public to admate_runtime;
   grant usage, select on all sequences in schema public to admate_runtime;
   -- no create, no BYPASSRLS, no access to the drizzle migrations schema
   ```

**Supabase `admate-staging`** (Singapore, in a separate "AdMate Staging"
organization on Pro):
1. Apply only the `profiles` migration.
2. Set up custom email: Resend, with a new staging-only API key, sender
   `AdMate (staging)` at an `admate.site` address. Keep the email rate limit low.
3. Under Auth, turn off "Allow new users to sign up" and keep Google off.
4. Set the Site URL and redirect URLs to `https://admate-tiktok-staging.vercel.app`.
5. Invite the testers. Leave the Data API on, because `profiles` relies on RLS
   and per-user policies.

## 4. Staging TikTok OAuth client (prepared, not sent)

This is one request, the same as the local one in Phase 3 apart from its name and
callback. TikTok client IDs are tied to their callback, which is why staging
needs its own.

```
POST https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/register
Content-Type: application/json

{"client_name":"AdMate (staging)",
 "redirect_uris":["https://admate-tiktok-staging.vercel.app/app/api/tiktok/oauth/callback"],
 "token_endpoint_auth_method":"none",
 "grant_types":["authorization_code","refresh_token"],
 "response_types":["code"]}
```

The `client_id` it returns goes only into `TIKTOK_MCP_CLIENT_ID` above. The
client is public: there's no secret, and PKCE plus the exact callback protect
it. The local client stays as it is, so your local authorization keeps working.

## 5. What staging can't reach

| Production asset | How staging is kept away from it |
| --- | --- |
| Production dashboard database | No credential exists in either staging project. The staging projects are separate, so production project settings never apply to them. |
| Production Supabase (users, profiles, Telegram, Meta data) | Option A: a different project. No service key anywhere in staging. |
| Meta credentials | Not set. The Meta OAuth code isn't on this branch (the Meta work is unmerged). |
| Telegram | No bot token. `telegramEnabled()` is false, so nothing is sent. |
| Anthropic and PostHog | Not set, so the Assistant is off and no analytics are sent |
| Cloud Run | Not involved at all |
| Testers' TikTok ads | Read-only allowlist in code; `tool_execute` and write tools are blocked |

**What staging does hold:** testers' TikTok reports and encrypted tokens, in Neon.
That is real advertising data, so treat it as production-grade:
- delete it after testing
- name Neon as a processor if staging runs beyond a short test

## 6. Migration compatibility

- **`main` / production:** `0000`–`0011`.
- **PR #39** adds `0012`–`0015`: new tables, plus one new column on its own table (`tiktok_syncs.summary`):
  - `tiktok_connections`, `tiktok_oauth_states`, `tiktok_advertiser_links`
  - `tiktok_syncs` (with `lock_token`)
  - `tiktok_sync_imports`

  Phase 6's `imports.status = "history"` is a value, not a schema change. Nothing
  existing is altered. For production later, the new tables also need explicit
  grants for `admate_cloudrun`, which has no default privileges.
- **The Meta worktree is incompatible as it stands.** It branches from an old
  `main` (PR #33) and its own `0006_meta_connections` collides with `main`'s
  `0006`–`0011`.
  - **The silent-skip risk:** Drizzle applies only migrations newer than the
    last one applied. A Meta migration merged after TikTok's, but timestamped
    earlier, would be **silently skipped**.
  - **The fix:** before either merges, rebase Meta onto `main` and regenerate its
    migration after the last merged one (`0016` if TikTok merges first).
  - **No table conflicts:** both use their own table prefixes.
  - **RLS difference:** Meta uses RLS with a restricted role. The TikTok tables
    rely on per-person filtering in code, like the rest of the dashboard. If RLS
    becomes the rule, add TikTok policies then.
- **Staging Neon gets exactly the PR #39 chain.** It never shares a database
  with Meta's Neon project.

## 7. Configuration steps and approval gates

| Gate | Who | Action |
| --- | --- | --- |
| G0 (optional, separate) | Claude, after approval | Remove the Preview scope from `META_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `admate-insights` |
| G1 | You | Choose option A or B. Confirm the domains and the branch name. |
| G2 | You (in the Supabase console) | Option A: create `admate-staging` (Singapore). The cost depends on your free-project slots (§8). |
| G3 | You, then Claude | Supabase: paste the `profiles` SQL I prepare. Add a **new staging-only Resend key** as custom email. Close sign-ups and set the URLs. Add the testers with "Add user", auto-confirmed, or by email invite. Each tester then sets their own password through "Forgot password" on the staging site. Send me the testers' staging user IDs. |
| G4 | You (Neon console), then Claude | Create the Neon project. Enter the owner URL privately when I run the migrations. Create the runtime role. Run the full test suite once against a throwaway Neon branch (`ADMATE_TEST_DATABASE_URL`), then delete the branch. |
| G5 | Claude | Create branch `staging/tiktok` on GitHub from PR #39's head |
| G6 | Claude (Vercel CLI), you for secrets if the CLI can't take them | Create both projects, protection, domains, Ignored Build Step and the settings in §3. Secrets go in without display. |
| G7 | Claude | Send the TikTok client registration in §4 and store its ID |
| G8 | Claude | First deployment (a push to `staging/tiktok`). Smoke checks: sign-in, the 404 for non-testers, a safe callback denial, no production calls. |
| G9 | Testers | The test sessions in §9 |
| G10 | You | Afterwards: keep staging, or delete the projects and data (Neon, Supabase, Vercel), and disconnect TikTok |

## 8. Costs

| Service | Change | Estimated cost |
| --- | --- | --- |
| Vercel (Hobby) | 2 new projects; builds only for `staging/tiktok` | $0. (Vercel's Hobby terms are for non-commercial use; that applies to production already and isn't new.) |
| Neon | 1 new Free project (0.5 GB, 100 compute-hours a month, scales to zero) | $0 |
| Supabase | Option A (chosen): a new organization on Pro with 1 project. **Verified:** your "AdMate" organization is on Free with 2 projects, so there is no free slot. | **About $25 a month plus tax.** The $10 credit covers the one Micro project. Your existing organization stays on Free. Cancel after testing. |
| Resend | A new staging-only API key on the existing account | $0. Shares the free 100-a-day limit with production. |
| Supabase | Option B: none | $0 |
| TikTok, GitHub, GCP or Cloud Run, PostHog, Anthropic, DNS | No change | $0 |

## 9. Test plan: 2–3 real AdMate users

**Who:**
- **Owner** (you)
- **Tester B**
- optionally **Tester C**

Each uses their own TikTok for Business login. Ideally at least one has an
advertiser with real history, to verify leads, revenue and registrations. Record
only pass or fail and counts, never tokens or campaign data.

| # | Test | Expected |
| --- | --- | --- |
| 1 | Sign-in | Invited testers sign in. A sign-up attempt is refused. A non-allowlisted signed-in user gets 404 on `/app/connect/tiktok`. |
| 2 | Authorization | Connect, then TikTok consent, then "connected". Cancelling shows "cancelled". Reopening the old callback URL shows "expired". |
| 3 | Isolation | B and C see only their own advertisers, links and accounts. Opening the owner's account URL gives 404. |
| 4 | Account linking | A matching currency links. A different currency and the sample account are refused. |
| 5 | Sync Now | With data: 3 spot-checked campaign-days match TikTok Ads Manager (spend, impressions, destination clicks). Note that TikTok's quick reports can differ slightly from downloads. Empty advertiser: "no data". A second click within a minute: "please wait". |
| 6 | Dashboard | Campaigns, insights and alerts show the account currency. Missing measures show "—". |
| 7 | Upload, sync and undo | A CSV upload plus a sync on the same days: no double counting. Undoing the latest sync brings back what it replaced. |
| 8 | Disconnect | Tokens are revoked at TikTok, links are removed, and imported numbers stay. Reconnect, relink and sync again works. |
| 9 | Revoked at TikTok | After removing AdMate's access in TikTok, Sync Now asks you to reconnect |
| 10 | Two people at once | B and C sync different accounts at the same moment: both succeed |

**Automated evidence already in PR #39:**
- 39 TikTok tests on the embedded database, including the Phase 7 concurrency
  test
- the same file can run against the throwaway Neon branch (G4) to exercise real
  concurrent transactions

## 10. Security risks and mitigations

- **Public staging URL:** mitigated by invite-only sign-in (A), the TikTok
  allowlist, and the private dashboard.
- **Leaked TikTok tokens could change ads.** The token itself (`mcp:tt4b`) allows
  more at TikTok than AdMate uses. Mitigations:
  - tokens are encrypted, and the key sits in a Sensitive Vercel variable
  - the database runs under a restricted role
  - testers disconnect at the end, which revokes the tokens
  - staging is deleted when testing ends
- **Wrong-project mistakes on a single Hobby team:** names-only `vercel env ls`
  checks before every deployment, Preview-and-branch-only scopes, and no
  production project changes in this plan.
- **Option B only:** production Auth sessions and tokens pass through staging
  code. That's why A is recommended.
- **Callback domain reuse:** if a staging project is deleted and its `vercel.app`
  name is later claimed by someone else, PKCE still makes intercepted codes
  useless. Delete or stop using the staging TikTok client at the end anyway.
- **Real ad data at a new processor (Neon):** keep it short-lived; delete at G10.

## 11. Phase 7b updates (2026-10-29)

**G0b, the old preview builds.** All `admate-insights` deployments were listed
(69 kept by Vercel; the oldest from 25 Sep). 46 are Preview builds made before
the G0 change at 16:05 UTC, so they still carry the Telegram secrets, and those
from 17 Oct onwards the Meta token too.

- **Proposed for deletion:** 45 builds. Every one is a Preview build:
  - all belong to branches whose PRs are **merged**, except 9 of PR #39 and 2 of
    `main` (redeploys from 25 Sep and 14 Oct)
  - PR #39's 9 are all **superseded**: its current preview was built after G0,
    without the secrets
  - the only links pointing at any of them are 15 `admate-insights-git-<branch>`
    preview links of merged branches
- **Untouched:**
  - the production deployments and `www.admate.site`
  - every build made after G0
  - one command-line build made by Codex on 29 Oct (no branch). It may belong to
    other work, so it's kept unless you say otherwise.
- **Who could run code with the secrets:** you (39 builds), the AI assistants
  working under your account (6), and the teammate Neat88 (1, write access).
  Fork builds are blocked (Git fork protection on), and the previews sit behind
  Vercel Authentication.
- **Recommendation:** delete the 45. No immediate rotation is needed, because
  only trusted collaborators ever had code running with the secrets. Rotate the
  Telegram bot token at the next planned production change (cheap, via
  BotFather), and renew the Meta token on its normal schedule. Rotate at once if
  anyone with push access since 7 Sep is no longer trusted.

**The 120-second Vercel proxy timeout.** It applies to rewrites to external
backends ([changelog](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes)).
A local build with Vercel's output format showed that with the bypass secret,
`/app` is **not** a rewrite: no `/app` route in `config.json`, and the secret
isn't in it. Every `/app` request runs in the website's own function, which then
calls the dashboard.

Even so, a 3–4-minute answer would still have to beat several timers:
- 300 s per function
- Node's default 300 s wait for response headers
- possibly Vercel's 120 s wait for the first byte between the two deployments

**Changed (code, not deployed):**
- `POST /api/tiktok/sync` now answers **202 within seconds**, after the checks and
  the lock. The sync runs in the background (`after()`, `maxDuration = 300`), with
  a 3-minute read budget.
- The page polls `GET /api/tiktok/sync?advertiserId=` every 2 seconds.
- The outcome and its summary are kept in `tiktok_syncs.summary` (migration
  `0015`, local only).

So no request is held open, and the same start/run split serves the future
scheduler.

## 12. Exact setup runbook (for G2–G4; nothing done yet)

### G2: paid Supabase organization (you, when ready for the tester sessions)
1. supabase.com, then **New organization**: name `AdMate Staging`, plan **Pro**.
   Keep the **spend cap on** (the default), so there's no usage overage. Your
   existing "AdMate" organization stays on Free.
2. In that organization, **New project**: name `admate-staging`, region
   **Southeast Asia (Singapore)**, compute **Micro**. Generate the database
   password and store it in your password manager. You won't need to give it to
   me.

### G3: staging Auth and email (you in the browser; I prepare and verify)
1. **SQL Editor:** paste the `profiles` SQL I put on your clipboard. It's exactly
   `supabase/migrations/20260903071150_…sql`: the table, RLS, the three own-row
   policies and the new-user trigger. Run it once.
2. **Authentication → Sign In / Providers → Email:**
   - Email: on
   - **Allow new users to sign up: off**
   - Confirm email: on
   - Email OTP length: **6** (the website expects 6 digits)
   - Google: off
3. **Authentication → URL Configuration:**
   - Site URL: `https://admate-tiktok-staging.vercel.app`
   - Redirect URLs: `https://admate-tiktok-staging.vercel.app/**`
4. **Resend** (resend.com, the account production uses), then API Keys →
   **Create API key**:
   - name `AdMate staging Supabase`
   - permission **Sending access**
   - domain **admate.site**

   Copy it once, straight into the next step. Never use the production key here.
5. **Supabase → Authentication → Emails → SMTP Settings**, then Enable custom
   SMTP:

   | Field | Value |
   | --- | --- |
   | Sender email | `staging@admate.site` |
   | Sender name | `AdMate (staging)` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the new staging key |

   Then **Rate Limits:** emails sent per hour = **10**.
6. **Optional:** start the email template subjects with `[Staging]`.
7. **Authentication → Users → Add user → Create new user**, once per tester, with
   **Auto Confirm User** on and no password needed (they sign in with an email
   code). Send me each tester's **User UID**. Those go into
   `TIKTOK_CONNECT_ALLOWED_USER_IDS`.
8. **Project Settings → API:** the Project URL and the publishable key are public
   values for G6. The service role key is **never** used in staging.

**I verify, read-only:**
- the table and policies exist
- sign-ups are refused for an uninvited address
- an invited tester gets a 6-digit code from `staging@admate.site`

### G4: Neon dashboard database (you create it; you run one command; I verify)
1. neon.com (the account Meta staging uses), then **New project**:
   - name `admate-tiktok-staging`
   - Postgres 17
   - region **AWS Asia Pacific (Singapore)**
   - Free plan
2. **Apply the dashboard migrations `0000`–`0015`.** In your Terminal, run the
   following. It asks for the owner connection string without showing it (copy
   the **direct**, non-pooled one from Neon → Connect):
   ```bash
   cd ~/Documents/GitHub/admate-insights-tiktok/dashboard && read -rs "DATABASE_URL?Neon owner URL (hidden): " && export DATABASE_URL && ~/.local/node/bin/node scripts/migrate.mjs; unset DATABASE_URL
   ```
3. **Create the restricted runtime user** in the Neon **SQL Editor**, as the
   owner.
   - First, generate a password and keep it on your screen only (built-in
     functions, no extension needed):
     ```sql
     select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') as new_password;
     ```
   - Then run the following, pasting that value in place of `<password>`:
     ```sql
     CREATE ROLE admate_runtime LOGIN PASSWORD '<password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
     GRANT CONNECT ON DATABASE neondb TO admate_runtime;
     GRANT USAGE ON SCHEMA public TO admate_runtime;
     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admate_runtime;
     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO admate_runtime;
     ```
   No access to the `drizzle` migrations schema, and it can't create or alter
   tables. Imports lock the account row (`SELECT … FOR UPDATE`), which needs
   only `UPDATE` on `workspaces`, granted above.
4. **Build the runtime connection string** from Neon's **pooled** string, with
   user `admate_runtime` and that password, keeping `?sslmode=require`. You
   paste it into Vercel at G6 as `DATABASE_URL`, Preview `staging/tiktok`,
   Sensitive.
5. **Check, run in the SQL Editor:**
   ```sql
   select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = 'admate_runtime'; -- all false
   select count(*) from drizzle.__drizzle_migrations; -- 16
   ```
6. **Real-Postgres test run:** in Neon, **Create branch** `test-run` from the
   empty, migrated database. Run the full TikTok test file against it:
   ```bash
   cd ~/Documents/GitHub/admate-insights-tiktok/dashboard && read -rs "ADMATE_TEST_DATABASE_URL?test-run branch owner URL (hidden): " && export ADMATE_TEST_DATABASE_URL && ~/.local/node/bin/npx vitest run tests/tiktok-connection.test.ts; unset ADMATE_TEST_DATABASE_URL
   ```
   Then delete the `test-run` branch. Over the network the file takes longer;
   its time limits are raised automatically when `ADMATE_TEST_DATABASE_URL` is
   set.

## 13. Tester readiness (needed before paying)

- **At least 2 people besides yourself is better; 2 total is the minimum.** Each
  needs:
  - their own email inbox, invited at G3
  - their **own TikTok for Business login**, with access to at least one
    advertiser (admin, operator or analyst in its Business Center)
  - a computer browser
- **For historical data:** Sync Now reads only the **last 30 complete days**. So
  "an advertiser with history" means **spend within the last 30 days**; older
  history isn't synced. Note its **currency and time zone**: the tester's
  staging ad account must use the same currency.
- **Your AdMate1027 is only right for the "no campaigns" case.** It's KHR, with
  no spend.
- **Each tester authorizes TikTok themselves** on the staging site. AdMate never
  asks for TikTok passwords.

## 14. Final cost and resource checklist (before the paid step)

| Item | Who | Cost | When |
| --- | --- | --- | --- |
| Supabase organization "AdMate Staging" on Pro, project `admate-staging` (Micro) | You | **$25 a month** + tax (the $10 credit covers Micro); spend cap on | G2, only when testers are ready |
| Resend staging-only API key | You | $0 (shares production's free 100/day) | G3 |
| Neon Free project `admate-tiktok-staging`, plus a temporary `test-run` branch | You create; you run one command | $0 | G4 |
| GitHub branch `staging/tiktok` (prepared locally, not pushed) | Claude | $0 | G5 |
| Vercel projects `admate-tiktok-staging` and `admate-tiktok-dashboard-staging` (Hobby) | Claude | $0 | G6 |
| TikTok staging OAuth client | Claude | $0 | G7, after the addresses are confirmed |
| Production, Cloud Run, Meta | nobody | unchanged | none |

**After testing (G10):**
- cancel the Pro organization (or delete the project)
- delete the Neon project
- delete or keep the Vercel projects
- remove the Resend key
- each tester disconnects TikTok

## 15. G0b done and background interruptions (2026-10-30)

**G0b:** the final per-build check passed for all 45:
- each belongs to `admate-insights` and is a Preview build
- none is Production or serves `www.admate.site`
- the only links pointing at them were merged branches' preview links
- none is PR #39's current preview

All 45 were **deleted, none failed**. `www.admate.site`, `/app` and Cloud Run
answer as before.

**Remaining exposure:**
- `glw5skwuc`, a Codex command-line Preview build from 29 Oct, kept on purpose.
  It still holds the Telegram secrets and the Meta token, behind Vercel's login.
- Production deployments naturally hold production secrets.
- No tokens were rotated, as instructed. Any copy made before the fix stays valid
  until rotation; nothing suggests one exists.
- `META_AD_ACCOUNT_ID` and `META_OWNER_USER_ID` are still in Preview
  (identifiers, not secrets).

**A background run cut off by the platform** (time limit or interruption):
- The database rolls back an unfinished write, and the account row lock is
  released when the connection drops.
- The sync lock now lasts **6 minutes**, longer than Vercel's 300-second limit,
  so a live run always holds it and a cut-off run frees the account soon after.
- The status then shows **interrupted**. The page says so and that retrying is
  safe; it polls up to 7 minutes.
- If the cut came after the data was saved but before the outcome was recorded,
  the retry replaces the same campaign-days, so nothing is counted twice.
- Covered by a test: interrupted, busy while locked, nothing half-written, the
  next sync works.
