# TikTok hosted multi-user staging: proposed plan (Phase 7)

Status 2026-10-29: **plan only.** Nothing in this document has been created,
registered, migrated or deployed. Each numbered gate in §7 needs explicit
approval. Automatic scheduling stays off and is not part of staging.

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
1. Apply migrations `0000`–`0014` once, with the owner's direct URL entered
   privately. Use `scripts/migrate.mjs`; it's the same migrator the app uses.
2. Create the runtime role, then hand its pooled URL to Vercel:
   ```sql
   create role admate_runtime login password '<generated, never shown>';
   grant usage on schema public to admate_runtime;
   grant select, insert, update, delete on all tables in schema public to admate_runtime;
   grant usage, select on all sequences in schema public to admate_runtime;
   -- no create, no BYPASSRLS, no access to the drizzle migrations schema
   ```

**Supabase `admate-staging`** (Singapore):
1. Apply only the `profiles` migration.
2. Under Auth, turn off "Allow new users to sign up" and keep Google off.
3. Set the Site URL and redirect URLs to `https://admate-tiktok-staging.vercel.app`.
4. Invite the testers. Leave the Data API on, because `profiles` relies on RLS
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
- **PR #39** adds `0012`–`0014`, which are new tables only:
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
    migration after the last merged one (`0015` if TikTok merges first).
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
| G3 | You, then Claude | Supabase: paste the `profiles` SQL I prepare, close sign-ups, and set the URLs. Add the testers with "Add user", auto-confirmed, or by email invite. Each tester then sets their own password through "Forgot password" on the staging site. Send me the testers' staging user IDs. |
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
| Supabase | Option A: 1 new project. The Free plan allows **2 active free projects**, and you already have AdMate and admate-dashboard. | $0 if Supabase offers Free when you create it. Otherwise a **separate** organization on Pro: about **$25 a month** (its $10 compute credit covers one Micro project). Your current organizations and projects are unchanged. Cancel after testing. |
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
