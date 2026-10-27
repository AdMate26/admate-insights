# Product analytics (PostHog)

One PostHog project (US region) covers the whole journey: the website
(TanStack Start) and the dashboard (Next.js, served at `/app` on the same site).

## Privacy rules

- **Consent first.** Nothing loads or is sent until the visitor clicks
  **Allow analytics** in the banner. The choice is stored in the browser under
  `admate.analytics-consent` and shared by both apps (same site). It can be
  changed from **Analytics settings** (website footer, dashboard sidebar).
  Accepting the Terms at sign-up is not analytics consent.
- **Off:** session replay, autocapture, heatmaps, dead clicks, exceptions, web
  vitals, surveys, feature flags and remote scripts.
- **Identity:** signed-in users are identified by their Supabase user ID only
  (never email or name), and the identity is reset on sign-out.
- **Filter:** every event passes `sanitizeEvent` (`src/lib/analytics/sanitize.ts`,
  kept identical in `dashboard/lib/analytics-sanitize.ts`):
  - URLs and referrers lose their query string and `#…` part.
  - IDs in paths become `:id`.
  - Other sites keep only their origin.
  - Only the events listed below are sent, and only with their listed short-code
    properties.
- **No duplicate page views:** the dashboard records `/app/*`. The website records
  everything else and drops `/app`, `/auth/callback`, `/home` and `/logout`.

## Events

| Event | App | Properties |
| --- | --- | --- |
| `$pageview` | both | cleaned URL, `app`, `app_env` |
| `login_completed` | website | `method`: `email_code` / `google` |
| `signup_completed` | website | `method` (first entry into the dashboard) |
| `report_upload_started` | dashboard | `file_type` (fixed list), `size_kb`, `new_account` |
| `report_previewed` | dashboard | `platform`, `level`, `granularity`, `rows` |
| `report_uploaded` | dashboard | `platform`, `level`, `granularity`, `breakdown`, `rows`, `days`, `new_account` |
| `report_upload_failed` | dashboard | `stage`, `reason` (e.g. `http_422`), `size_kb` |
| `report_undone` | dashboard | none |
| `analysis_viewed` | dashboard | `account` (`demo` / `sample` / `own`), `view` |
| `recommendation_viewed` | dashboard | `account`, `view`, `detector`, `kind` |
| `telegram_connected` | dashboard | none |

Every event also carries `app` (`website` / `dashboard`) and `app_env`
(`production` / `preview` / `cloudrun` / `local`). Filter insights to
`app_env = production` for real usage. Returning users come from PostHog's
Retention and Lifecycle insights on identified users, so no extra event is
needed.

## Configuration

| Vercel project | Variables (Preview first, Production after approval) |
| --- | --- |
| `admate-insights` (website) | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST=https://us.i.posthog.com` |
| `admate-dashboard` | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com` |

- The key is the PostHog **project token** (`phc_…`). It is public by design.
- The variables are read at build time, so redeploy after changing them.
- Without a key there is no banner and nothing runs.
- Vercel Preview builds of the website are not connected to a dashboard (the
  dashboard settings are Production-only). Test dashboard events locally
  (`localhost:3000` website + `localhost:3100` dashboard); they arrive tagged
  `app_env = local`.

## Funnel: signup to first analysis

In PostHog, create a new insight → **Funnel**:

1. `signup_completed`
2. `analysis_viewed`

- Conversion window: 14 days.
- Filter: `app_env` = `production` (`local` / `preview` while testing).
- Counting by unique persons gives the first time each person viewed an analysis.

## Recommended PostHog project settings

- Session replay: **off**.
- Autocapture: **off**.
- Heatmaps: **off**.
- **Discard client IP data: on.**
