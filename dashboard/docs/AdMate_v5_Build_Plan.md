# AdMate v5 — Build Plan

**What this is:** the plan for building prototype v5.1 into the real AdMate app, with real sign-in and your uploaded data.
**Status:** approved 22 October 2026. Your decisions: everyone answers the welcome question once; two releases. The live site (admate-alpha.vercel.app) stays on v3 until you say "go live".
**The spec:** prototype v5.1 ([comparison doc](AdMate_Three_Level_UX_UI_Comparison.md), the prototype link, code in `docs/prototype/`).

## Progress

| Phase | Status | Where to try it |
|---|---|---|
| 0. Foundations | **Done** (22 October): welcome question, "Your view" switch, three menus, the calendar in every view, shared engine | Vercel Preview of branch `v5-app` |
| 3 (part) | **Done** (22 October): Portfolio, Explorer (saved views in your account, CSV) and Budget by goal, brought forward at your request | Same preview |
| 1, 2, 3, 4, 6, 7 | **Built** (22 October): every page in the prototype's look (its stylesheet and screens, on your real data): Beginner Home / To-do / My ads; Intermediate Overview / Optimize / Campaigns with Compare / Audiences & creatives; Advanced Overview / Actions with bulk decisions / Campaigns / Explorer / Budget / Audience / Alerts; the item panel in three depths; the Assistant in each view's style; Alerts saved to the account; Telegram sending | Same preview. The Assistant needs `ANTHROPIC_API_KEY` and `ADMATE_ASK_ENABLED=true`; Telegram needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` (and, for scheduled messages, `CRON_SECRET` plus the GitHub Action's two secrets) |
| 5, 8 | Check on your real accounts, then your "go live" | — |

---

## In one minute

- **What we build:**
  - the three views (Beginner, Intermediate, Advanced), each with its own menu and pages;
  - the calendar date picker everywhere;
  - Advanced Campaigns, Explorer and Budget by goal;
  - the two-part Alerts;
  - the AdMate Assistant.

  All of it works on real accounts and real uploads.
- **Much of the groundwork exists already.** v3 has:
  - the engine, sign-in and several accounts per user;
  - uploads and saved decisions (done / remind / dismiss);
  - the campaign table, audience insight and the summary report;
  - a date picker with comparisons;
  - an Assistant that is built but switched off.
- **How:** on a new branch, `v5-app`, in phases. Each phase ends with a Vercel Preview link. You sign in there with your normal account and try it on your own data.
- **Effort:** about 9–11 build sessions. This is an estimate; Explorer and Alerts are the biggest unknowns.
- **Two releases (recommended):** release 1 is the three views plus the Assistant; release 2 is Alerts plus Telegram.
- **Safety:**
  - Database changes only add new tables. Nothing is renamed or removed, so the live v3 keeps working even though previews use the same database.
  - Today's live version gets a `v3` tag, so it can be restored at any time.
- **What I need from you:** 3 decisions before I start (section 6), and 3 more later.

---

## 1. What exists today and what's new

| Area | In the real app today (v3) | What v5.1 adds | Size |
|---|---|---|---|
| Engine (numbers, priorities) | The same engine the prototype uses | Move the prototype's extra calculations into it: money at stake, "what changed and why" (drivers and top movers), one row per campaign, ad set and ad | M |
| Views | One view for everyone | Welcome question, "Your view" switch, three menus; switching keeps the subject; the choice is saved to the person's account | M |
| Date picker | Day / week / month / dates; compare with the period before, any period, or nothing | The two-month calendar for "dates"; shown in all three views; a plain sentence in Beginner | S |
| Home / Overview | One Overview page | Beginner Home, Intermediate Overview ("what changed and why"), Advanced Overview (dense) | L |
| Decisions | Actions page: Action taken / Remind me later / Dismiss, saved per account, re-checked after the next upload | Beginner To-do (one at a time), Intermediate Optimize (ranked by money at stake), Advanced Actions (filters, bulk decisions) | M |
| Detail panel | One drawer for everyone | Three depths: plain / investigate (numbered steps) / plus statistics | M |
| Campaigns | Campaign › ad set › ad table | Beginner My ads (cards); Compare 2–3 items (Intermediate, Advanced); creatives within ad sets; Advanced extra columns | M |
| Audience | Audience insight with breakdown uploads | Intermediate "Audiences & creatives"; Advanced index and z-score | S |
| Portfolio | Account switcher (several accounts per user) | Every account in one table, plus "needs action now" across accounts | M |
| Explorer | — | Any level, chosen columns, filters, grouping with subtotals, quick and saved views, CSV | L |
| Budget | — | Spend by goal; click a goal to see all its campaigns; daily spend chart; add / fix first / spend less | M |
| Alerts | — (the old alerts address redirects to Actions) | Automatic alerts (vs its past, vs its target), your own KPI alerts, campaign targets, check switches, menu badge | L |
| Telegram | — | Connect Telegram; send after each upload and/or on a schedule | M · needs your bot token |
| Assistant | "Ask AdMate" built but switched off: Claude on the server, AdMate's tools, 40 questions per account per day, usage log | A style per view, suggested questions per page, the "AI answer" label, switched on | S |
| Upload, Reports, Goals & settings, Summary report | In v3 | Kept; menus per view (Beginner hides Reports) | S |

S = a few hours · M = about half a session · L = a session or more.

---

## 2. How we'll build it

- **The prototype is the spec.** Where the app and the prototype differ, the prototype wins unless you decide otherwise.
- **One engine, the same numbers.** The prototype's extra calculations move into the app's engine, with tests, and the prototype is rebuilt from that same code. The sample account must show identical numbers in both.
- **Same addresses, different views.** Each subject keeps one address. For example, `/c/<account>/campaigns` shows My ads, Campaigns or the dense Campaigns table depending on your view. Switching views keeps you on the same page wherever it exists in both views.
- **Settings move from the browser to your account.** That covers your view, saved views, alert settings, campaign targets and the Telegram link, so they follow you across devices.
- **AdMate stays advisory.** It never changes ad accounts. Bulk decisions only record what you decided.
- **Previews before anything goes live.**
  - Each phase is pushed to `v5-app` and Vercel builds a Preview.
  - You sign in to Vercel, then to AdMate with your normal account.
  - Production only changes when you say "go live".

---

## 3. Phases

### Release 1: the three views and the Assistant

| Phase | What you'll be able to try | Main work | Sessions |
|---|---|---|---|
| **0. Foundations** | The welcome question; the "Your view" switch; the three menus; the calendar date picker in every view | Branch `v5-app` and the `v3` tag; shared engine pieces with tests; the view saved to your account (new table); three menus and view switching; the calendar | 1 |
| **1. Beginner** | Home ("Am I doing OK?", Fix this first, What's working, one chart, plain terms); To-do; My ads; the plain detail panel | Pages and plain wording from the prototype; decisions reuse v3's saving | 1 |
| **2. Intermediate** | Overview with "What changed and why"; Optimize ranked by money at stake (plus Watch); the investigate panel; Campaigns with Compare; Audiences & creatives | Pages and charts; Compare; creatives within ad sets | 1.5–2 |
| **3. Advanced** | Portfolio across your accounts; the dense Overview; Actions with bulk decisions; Campaigns with extra columns; Explorer with saved views and CSV; Budget by goal; Audience with index and z-score | Pages; saved views (new table); a speed check with several real accounts, and caching if needed | 2–3 |
| **4. Assistant** | "Ask AdMate" in every view, writing in that view's style, with suggested questions for the page | A style per view; suggested questions; the "AI answer" label; switched on in previews; real cost per question measured | 0.5–1 |
| **5. Check and go live** | The whole release on your real accounts | Every page in each view; phones; speed; numbers against the prototype; a fix list; then your "go live" | 1 |

### Release 2: Alerts and Telegram

| Phase | What you'll be able to try | Main work | Sessions |
|---|---|---|---|
| **6. Alerts in the app** | Automatic alerts (vs its past, vs its target), your own KPI alerts, campaign targets, check switches, the Alerts badge | Alert checks moved into the engine, with tests; three new tables; "AdMate decides" tuned on your real exports | 1 |
| **7. Telegram** | "Connect Telegram", then real messages after an upload and/or at the times you pick | The AdMate bot and connect step; sending; a scheduler; a log so nothing is sent twice | 1 |
| **8. Check and go live** | Alerts and Telegram on your real accounts | The same checks as phase 5; then your "go live" | 0.5 |

**Total: about 9–11 sessions.** Each phase ends with a preview and a short "what to try" list. The next phase starts when you're happy with it. Until release 2, the Advanced menu doesn't show Alerts.

---

## 4. Database changes (all additive)

| New table | Holds | Phase |
|---|---|---|
| `user_settings` | Each person's view (Beginner, Intermediate or Advanced) and whether they answered the welcome question | 0 |
| `saved_views` | Explorer views a person saved | 3 |
| `alert_settings` | Per account: automatic alerts on or off, compare with past and/or target, sensitivity, good news, and which checks are switched off | 6 |
| `alert_rules` | Your own KPI alerts | 6 |
| `campaign_targets` | Each campaign's own target, with its unit (cost per result, ROAS or CPM) | 6 |
| `telegram_links` | Each person's Telegram chat, schedule and time zone | 7 |
| `alert_sends` | What was sent and when, so the same alert isn't sent twice | 7 |

- **No existing table changes.** Previews and the live site share the database, so these tables appear when the first preview builds, and v3 ignores them. Every change is tested on the local database first.
- **Some things you do in a preview also show on the live site.** For example, marking a problem "done" is stored in a table v3 also uses, because it's the same account data.

---

## 5. The Assistant: model and cost

The app already uses **Claude Opus 5.5**, limited to 40 questions per account per day.

| Model | Price per million tokens (input / output) | Estimated cost per question | Example: 50 accounts × 3 questions a day |
|---|---|---|---|
| Claude Opus 5.5 (current default) | $4 / $20 | about 5–15 US cents | about $225–675 a month |
| Claude Sonnet 5.5 | $2 / $10 | about 2.5–7.5 cents | about $110–340 a month |
| Claude Haiku 5.5 | $0.10 / $0.50 | under half a cent | under $20 a month |

- **How the estimates were made:** 10–25 thousand input tokens per question (partly cached) and 1–3 thousand output tokens.
- **Real cost comes first.** Phase 4 measures the real cost from the app's usage log before you decide anything.
- **Worst case:** at the current cap, about $2–6 per account per day on Opus 5.5.
- **Cheaper models may give weaker answers.** I'd compare them on your real data before switching.
- **Grounded answers:** the Assistant only uses numbers from AdMate's own tools, never calculates new ones, and says how sure it is. Its answers are labelled "AI answer".

---

## 6. Decisions I need from you

**Before I start:**
1. **Approve this plan,** including previews on the live database (additive changes only).
2. **Existing users at go-live:**
   - (a) Everyone answers the welcome question once. Recommended: people choose by job.
   - (b) Everyone starts in Intermediate, the closest to today's v3, and can switch.
3. **One go-live or two:**
   - (a) Two releases: the views and the Assistant first, then Alerts and Telegram. Recommended: you get value sooner and each go-live is smaller.
   - (b) Everything at once.

**Before phase 4 (Assistant):**

4. **Model and daily limit** (see section 5). Today's settings are Opus 5.5 and 40 questions per account per day.

**Before phase 7 (Telegram):**

5. **Create the AdMate bot.** You create it in Telegram with BotFather (about 2 minutes; I'll give you the steps) and paste its token into Vercel's environment variables yourself. I never handle tokens.
6. **When messages go out:**
   - (a) **Right after each upload.** Recommended to start: it's free and needs no scheduler. AdMate's data only changes when a report is uploaded, so that's when there's news.
   - (b) **Also at times people pick, as in the prototype.** Vercel's free plan runs scheduled jobs only once a day, within an hour of the set time. So this needs Vercel Pro (paid) or a free hourly trigger from GitHub. Scheduled messages would say "nothing new since <date>" or remind people to upload, rather than repeat the same alerts.

---

## 7. Risks and how we handle them

| Risk | How we handle it |
|---|---|
| Previews share the live database | Additive changes only; tested locally first; nothing renamed or removed |
| App and prototype numbers drift apart | One shared engine; tests; the sample account must match exactly |
| AI cost | A daily cap per account; the usage log; the model choice is yours; a weekly cost check in the first month |
| Wrong AI advice | The Assistant answers only from AdMate's numbers, states its confidence, and is labelled "AI answer" |
| Too many false alarms | "AdMate decides" limits tuned on your real exports before release 2 |
| Slow pages with many accounts or ads | Measured on real data; cached per account, upload and period if needed |
| Scope keeps growing | Each phase previewed and approved before the next; new ideas go on a list for later |

---

## 8. Not in this build

- Direct Meta, TikTok or Google connections. They need platform approval and credentials, so they're a separate decision.
- Agency features: client folders, team members and permissions, white-label reports.
- Comparing a new campaign with earlier campaigns of the same goal.
- Alerts for Beginner and Intermediate. This is still an open question and could follow release 2.
- Email or LINE alerts.
- Forecasts. Your decision: AdMate looks backward only.
- AdMate changing ad accounts. It's advisory by design.

---

## 9. How each phase is checked

**Before I hand over a preview:**
- type check, lint, unit tests and a full build;
- every page in each view, on the sample account and your real accounts;
- phone width;
- numbers that match the prototype.

**What you do:** open the preview link, sign in, and try that phase's "what to try" list. Reply with fixes, or "next phase".

---

## Appendix: technical notes for the build sessions

- **Branch:**
  - Create `v5-app` from `master` (690a8de), and tag `v3` at 690a8de before the first push.
  - Bring `docs/prototype/` and the docs over from `v5-prototype`. Don't ship `public/prototype.html` to production.
- **Next.js 16:** read the relevant guide in `node_modules/next/dist/docs/` before writing code (see AGENTS.md). `proxy.ts` is the sign-in gate. Cache Components are not enabled.
- **Engine:**
  - Create `lib/analysis/viewModel.ts`, ported from `view()` in `docs/prototype/src/entry.ts`: impact, drivers, movers, level rows, details, great and reuse. `entry.ts` then imports it.
  - Create `lib/analysis/alerts.ts`, ported from `ui/45-budget-alerts.js`: `autoAlerts`, `alertsFired`, `campaignTarget` and the Telegram message.
  - Add vitest tests for both.
- **Routes:**
  - The view decides the content and the menu labels:
    - `/c/[ws]` → Home / Overview / Overview;
    - `/actions` → To-do / Optimize / Actions;
    - `/campaigns` → My ads / Campaigns / Campaigns;
    - `/audience` → — / Audiences & creatives / Audience.
  - New routes: `/explorer`, `/budget`, `/alerts` (replacing the redirect) and `/portfolio`. Portfolio lives at `/c/[ws]/portfolio`, inside the account frame, so the menu stays in place.
  - A page a view doesn't have redirects using the prototype's EQUIV map.
- **View setting:** a `user_settings` row, read in the account layout and changed with a server action. Show the welcome dialog when it's unset (or as decision 2 says).
- **Period:** the URL parameters stay as they are. Replace the "dates" inputs in `components/v3/PeriodPicker.tsx` with the two-month calendar, and add Beginner's context sentence.
- **Decisions:** keep `rec_status`, and add a bulk server action for Advanced Actions.
- **Explorer:** the server sends flat rows; filtering, sorting, grouping and CSV happen in the browser. Paginate or narrow by level if the number of ad-level rows is large.
- **Portfolio:** loop over the user's workspaces, with the sample account marked or left out. Measure first, and cache by (workspace, latest import, period) if slow.
- **Assistant:**
  - Add a style addendum per view to `SYSTEM` in `lib/ai/assistant.ts`, plus suggested questions per page.
  - Keep `ADMATE_MODEL`, `ADMATE_ASK_DAILY_LIMIT` and `ADMATE_ASK_ENABLED`. Turn on `ADMATE_ASK_ENABLED` for Preview first and Production at go-live.
  - Keep the server-side refusal fallback.
- **Telegram:**
  - The webhook route checks Telegram's secret-token header.
  - The deep link `t.me/<bot>?start=<one-time code>` links a person's chat.
  - "Right away" sends from the import-commit route.
  - Scheduled sends run through `/api/cron/alerts`, protected by `CRON_SECRET`. `alert_sends` prevents repeats.
- **Migrations:**
  - `drizzle/0006_…` onward, all `CREATE TABLE`. Locally (PGlite), migrations run when the app starts; test with `npm run dev`, then `npm run build`.
  - Previews run migrations on the live database at build time.
  - Drizzle applies only migrations newer than the last one recorded. So don't add a migration on `master` while `v5-app` previews have applied newer ones there.
