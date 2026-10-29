# TikTok sync: Phase 5 review and the plan for daily automatic sync

Status on 2026-10-29: everything below is on the draft branch
`codex/tiktok-mcp-oauth-foundation` (PR #39) and local only. Nothing is deployed,
no shared database has the TikTok migrations (`0012`–`0014`), and scheduled
sync is **not** implemented.

## 1. What a sync may replace (fixed in Phase 5)

`commitImport` was built for uploads: a new upload hides **every** active row of
the same platform whose dates overlap the upload's period (newest upload wins,
kept for undo). Phase 4 reused that rule for Sync Now. The audit confirmed four
problems, each now covered by a regression test that fails with the old rule:

| Problem (old rule) | Example |
| --- | --- |
| Hid uploads of **other campaigns** | A TikTok CSV for a campaign TikTok no longer returns disappeared for the synced dates |
| Hid a **summary export reaching outside the window** | A 15-day summary report vanished entirely, including its 10 days before the sync window |
| Hid uploaded days **TikTok had no row for** | Sparse dates: a campaign's uploaded day without a TikTok row was hidden with no replacement |
| Hid earlier synced campaigns **missing from a later sync** | A campaign absent from the latest report lost its earlier synced days |

**New rule for syncs** (`syncReplacement` in `lib/data/imports.ts`; uploads keep
exactly their old rule): a sync hides stored data only where it brings TikTok's
new number for the **same campaign and day**.

- **Campaigns not in the sync:** never touched, whatever their source.
- **Single-day rows** (earlier syncs, daily uploads, ad-set or ad level): replaced
  only on the days the sync has a row for that campaign. All levels are replaced
  on those days, so nothing is counted twice.
- **Multi-day rows** (summary exports):
  - replaced only when they lie inside the window and the sync has rows in them
  - otherwise the summary is kept, and the sync leaves out its own rows for those
    days (shown as "N rows left out")
  - if every row is covered this way, nothing is written (outcome `skipped`)
- **Undo:** each sync import is recorded in `tiktok_sync_imports` (advertiser and
  asked dates). Undoing an older import hands its replaced rows to the first newer
  import that *would have* replaced them, using the upload rule or the sync rule.
  So undo never double-counts and never hides too much. Undoing the newest import
  works exactly as before.

**Trade-off:** if TikTok stops returning a day it returned before, AdMate keeps the
earlier number rather than dropping it. For example, a day later corrected to no
delivery keeps its old spend. This is rare, visible, and can be undone. Hiding
data without a replacement was judged worse.

## 2. Unsupported metrics stay unavailable (fixed in Phase 5)

The engine already ignored missing measures: each import records its `columns`,
and reach is never added up across days. The dashboard's campaign table ignored
that and showed:

- **reach and frequency:** added up across days, so too high
- **revenue:** `0` when the data had no revenue
- **results:** `0` when the data had no result measure

`lib/analysis/viewModel.ts` now passes these as `null`, which the dashboard shows
as "—". Places that add these values together treat a missing one as 0, which is
what they did before. The analysis engine itself is unchanged. A test confirms
the engine produces identical KPIs, verdicts and findings for synced data and for
the same rows uploaded as a file.

## 3. Capacity: the 50-report limit (design, not built)

**The problem.** Each sync that changes anything creates an import. With a 30-day
window synced daily, every import is mostly replaced by the next one, but keeps
the one day that falls out of the window. Imports therefore never become empty:
365 syncs make 365 imports, each with one active day.

The effects:
- Sync Now stops at 50 (`import_limit`).
- The "compare reports" list fills with sync entries.
- About 29 of every 30 stored copies are inactive undo history.

**Proposal: rolling consolidation of sync imports.**

1. **Count syncs separately.** `checkImportLimit` counts only uploads (imports
   without a `tiktok_sync_imports` row). Syncs follow the retention rule below.
2. **Keep the newest K = 7 sync imports per advertiser as they are.** They stay
   undoable, newest first.
3. **Fold older sync imports into one "TikTok history" import per advertiser** (and
   per column set, so a measure is never claimed for data that lacked it). This
   runs in the same transaction as the sync that pushes one out of the newest K:
   - Re-point the old import's active rows to the history import.
   - Keep its inactive rows that one of the K newest syncs, or any upload, would
     restore on undo (re-pointed too).
   - Delete inactive rows that only an older, folded sync replaced. No undo can
     reach them any more.
   - Mark the old import `merged`. It is kept for audit, but left out of Reports,
     the limit and report-mode comparisons.
4. **Undo:** the K newest syncs and all uploads keep Undo. The history import gets
   an explicit "Remove synced history" action instead of Undo.
5. **What doesn't change:**
   - Date-range comparisons read rows by date, so they are unaffected.
   - History before the window is preserved.
   - Storage stays bounded at about K × 30 days × campaigns of undo copies.

Before building it, write tests for:
- Reports, the limit and comparisons after 60 simulated daily syncs
- undo of each of the K newest syncs
- an upload in between
- a column-set change

## 4. Lock, retries and time limits (reviewed; gaps fixed in Phase 5)

| Gap found in Phase 4 | Fix |
| --- | --- |
| The 5-minute lock could lapse while a slow read (up to 50 pages × 25 s) went on, so a second run could start and both could write | Reading has a 4-minute budget (`SYNC_BUDGET_MS`), the lock lasts 10 minutes, and each run has a random lock token. The import transaction re-checks and extends the lock, so a run that lost it rolls back. Only the holder can release it. |
| A crashed run blocked the account | The lock expires (10 minutes) and a new run takes over (tested) |
| One temporary TikTok error failed the whole sync | Each page is retried twice (after 1 s and 4 s) for network errors, timeouts, HTTP 429/5xx and TikTok codes 40100/50000/50002. Other errors are final. |
| An access token could expire mid-run | Sync asks for a token valid for the whole budget plus 5 minutes, refreshing first if needed |

**Still needed for unattended runs:**
- a failure count and backoff per account
- a cap on runs per invocation
- an alert when the same account fails 3 days in a row

All of these are in section 5.

## 5. Proposal: daily automatic sync (not built)

- **Trigger:** extend the existing scheduled endpoint (`/api/cron/alerts` pattern,
  `Authorization: Bearer CRON_SECRET`) with `/api/cron/tiktok-sync`, called
  hourly:
  - on Vercel by a cron, or the GitHub Action used for alerts
  - on Cloud Run by Cloud Scheduler
- **Keep Vercel and Cloud Run aligned:** both need the same trigger and settings,
  or neither gets it.
- **Who is due:** linked advertisers whose next run time has passed. Add
  `next_run_at`, `failures` and `paused` to `tiktok_syncs` (new migration).
  - Default: once a day at about 04:00 in the advertiser's time zone. Yesterday is
    then complete, and the 30-day window picks up TikTok's later corrections.
- **Per invocation:** at most a few accounts, one at a time, inside the function's
  time limit. The same lock and budget as Sync Now apply. Remaining accounts wait
  for the next hourly call.
- **Skipped, never forced:**
  - the feature is off or the person isn't allowlisted
  - the connection needs reconnecting
  - the account is the sample, or the currency no longer matches
  - the advertiser is no longer authorized

  Each case records its reason and sends one reminder (section 6).
- **Backoff:**
  - after a failure: 1 h, then 4 h, then 24 h
  - after 3 days of failures: pause, and remind the person
  - a manual Sync Now resets the backoff
- **Telemetry:** counts and outcome codes only; never tokens, report rows or
  advertiser names.
- **Capacity:** needs section 3 first, or accounts hit the limit after 50 days.

## 6. Proposal: reconnect reminders (not built)

TikTok's authorization lasts a fixed 30 days (`refresh_expires_at`).

- **In-app:** a banner on the dashboard and on `/app/connect/tiktok` 7 days before
  the end, and when the status is `reauth_required`.
- **Telegram:** for people who connected it (existing `lib/telegram.ts`), at 7, 3
  and 1 days before, and once when it lapses.
  - A `tiktok_reminders` table (person, kind, sent at) prevents duplicates.
- **Email:** later, through the existing privacy-reviewed address flow, if wanted.
- **Content:** the message never includes tokens. It names the advertiser only
  inside the signed-in app, not in Telegram.

## 7. Proposal: hosted multi-user testing (not set up)

1. **A separate staging database** for the dashboard (not `admate-dashboard`),
   with migrations `0012`–`0014` applied there only, after approval.
2. **A Vercel Preview environment with a stable preview domain:**
   - `TIKTOK_CONNECT_ENABLED=true` and a tester allowlist, in the Preview scope
     only
   - its own `TIKTOK_CONNECT_ENCRYPTION_KEY`
   - its own TikTok client registered for exactly that domain's callback

   Production keeps the feature off. Cloud Run keeps it off until production does.
3. **Two or three tester accounts**, each authorizing their own TikTok
   advertisers. Check:
   - isolation
   - reconnect
   - currency refusal
   - Sync Now on an advertiser with real history (leads, revenue and
     registrations mapping still to verify)
   - undo
4. Then run the scheduled sync there for at least a week before production.
5. **Before production:** reconcile migration numbering with the Meta branch,
   which also adds migrations after `0011`.

## 8. Remaining steps before daily automatic sync

1. Approve this design. Build section 3 (capacity) with its tests.
2. Build the scheduler (section 5) and the reminders (section 6), with tests.
3. Verify the unverified metrics (leads, revenue, registrations) with an
   authorized advertiser that has history, then decide whether to enable them.
4. Set up the hosted staging environment (section 7), with approval for its
   database and TikTok client.
5. Reconcile migration numbers with the Meta branch. Review PR #39 for merge.
6. Only then, with approval: production migration, production settings, and
   turning the schedule on (Vercel and Cloud Run together).
