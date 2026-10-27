# AdMate

AI marketing analyst for people who run their own ads. Upload an export from **Meta, TikTok, Google Ads or LinkedIn** and AdMate tells you what needs attention, why, and what to do next, with the numbers behind every suggestion. See [docs/product-plan.md](docs/product-plan.md) for the current plan and [prd.md](prd.md) for the full spec.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and create an account (email + password). Every new account starts with its own copy of the **Lotus Skincare** sample (Meta + TikTok, with a few planted problems); **Add an ad account** to upload a real export.

Locally, data is stored in `.data/` (an embedded Postgres, PGlite). Set `DATABASE_URL` to use a hosted Postgres instead. See [.env.example](.env.example) for every setting.

## Deploy to Vercel

Live at https://admate-alpha.vercel.app (Vercel project `admate`, code in the private GitHub repo `Neat88/admate-app`).

- **Push to `master`** → Vercel builds and deploys the live site automatically.
- **Push any other branch** → Vercel builds a private preview (visible only when signed in to Vercel).
- `npm run build` applies database migrations (`scripts/migrate.mjs`) before building, so schema changes ship with the code.

Setup (already done for this project): Neon Postgres connected under **Storage** (its variables use the `DATABASE_URL_` prefix, which `lib/db/client.ts` reads), functions in Singapore (`vercel.json`), and these environment variables: `ADMATE_INVITE_CODE` (only people with the code can sign up), `NEXT_PUBLIC_POSTHOG_KEY` (analytics), optionally `ANTHROPIC_API_KEY` (AI).

On Vercel, uploads are limited to 4 MB per file (Vercel's request size limit).

## Sign-in and analytics

- **Sign-in**: email + password (`lib/auth/`, `app/(auth)/`). Passwords are hashed with scrypt; sessions live in the `sessions` table and a 30-day httpOnly cookie. `proxy.ts` sends signed-out visitors to /login; every page, server action and API route also checks that the account belongs to the signed-in user (`requireWorkspace` / `getWorkspace` in `lib/data/workspaces.ts`).
- **Analytics**: PostHog (`lib/analytics.ts`), only when `NEXT_PUBLIC_POSTHOG_KEY` is set **and** the person chose "Allow analytics" (`components/AnalyticsConsent.tsx`, shared with the website). Page views and named events only — no session replay, autocapture or heatmaps; signed-in users are identified by their Supabase user ID, never email. Every event passes `lib/analytics-sanitize.ts` (no query strings, IDs or free text). Events: `report_upload_started`, `report_previewed`, `report_uploaded`, `report_upload_failed`, `report_undone`, `analysis_viewed`, `recommendation_viewed`, `telegram_connected`. See `docs/analytics.md` at the repository root.

### Optional: AI (summaries and Ask AdMate)

Without a key, AdMate writes summaries from templates and the assistant panel explains that it needs a key. To turn AI on, create `.env.local`:

```bash
ANTHROPIC_API_KEY=your-key-here
# Optional:
# ADMATE_MODEL=claude-opus-5-5        # default; claude-sonnet-5-5 is cheaper
# ADMATE_ASK_DAILY_LIMIT=40           # questions per account per day
```

The AI never does maths. Summaries reword numbers the engine computed, and the assistant looks things up through read-only tools. Any AI text that contains a number the engine didn't produce is rejected or flagged. Summaries are cached per set of numbers, and every call is logged in the `ai_usage` table.

## Test

```bash
npx vitest run
```

- `tests/ingest.test.ts`: export parsing (Meta, TikTok, Google, LinkedIn formats) and which columns an export contains. Put real exports in `fixtures/private/` (git-ignored) to include them.
- `tests/analysis.test.ts`: periods, statistics, decomposition, data reliability (missing columns, reach, peer groups), and the planted issues in the sample accounts.
- `tests/assistant.test.ts`: the assistant's tools and the number check, offline.

## How it works

| Layer | Where | What |
|---|---|---|
| Ingest | `lib/ingest/` | Detects the platform, maps columns, records which measures the file actually has, reads periods, infers each campaign's objective |
| Store | `lib/db/`, `lib/data/` (PGlite locally, Postgres via `DATABASE_URL`) | Campaigns, ad sets and ads plus additive daily/period facts. Overlapping uploads: newest wins, with undo |
| Compare | `lib/analysis/periods.ts` | Previous period, same period last year, any range, day vs day, report vs report |
| Judge | `lib/analysis/analyze.ts`, `goalStatus.ts` | Objective-specific KPI; verdict against target → own history → similar items (≥ 2); goal status per objective |
| Diagnose | `lib/analysis/decompose.ts` | Splits a KPI change into CPM, CTR, conversion rate, frequency and order value |
| Find | `lib/analysis/detectors.ts` | Rules at campaign, ad set and ad level → one `Finding` per item with what happened, why it matters, likely cause, evidence, action, priority (and why), the rule that fired, data basis, money at stake and extra cost |
| Data notes | `lib/analysis/dataNotes.ts` | Missing columns, currency/attribution mismatches, incomplete last day, stale data |
| Explain | `lib/analysis/narrative.ts`, `managerSummary.ts`, `lib/ai/` | Home summary, manager summary, and the Ask AdMate assistant (`lib/ai/tools.ts`, `assistant.ts`) |

Schema changes: edit `lib/db/schema.ts`, run `npx drizzle-kit generate`, commit the new file in `drizzle/`. The next deploy applies it.
