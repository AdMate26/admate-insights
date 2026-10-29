# Product analytics (PostHog)

One PostHog project (US region) covers the whole journey: the website
(TanStack Start) and the dashboard (Next.js, served at `/app` on the same site).

## Two ways events are recorded

- **Signed-in people (dashboard): by AdMate's server, no banner.** The dashboard
  tells `/app/api/activity` which page was opened or left, over the login
  session people already have. `lib/analytics-server.ts` then sends the event to
  PostHog with the Supabase user ID and account email, grouped into visits.
  - A new visit starts after 30 minutes without activity (`user_visits` table).
  - Sign-up (`signup_completed`) is recorded by the session bridge.
  - Opening an account's Overview counts as `analysis_viewed`.
  - No tracking cookie or browser storage is used. This is covered by the
    Privacy Policy ("when you are signed in").
- **Everyone else (public pages, demo): in the browser, after cookie consent.**
  Nothing loads until the visitor clicks **Accept** in the "We use cookies"
  banner. The choice is stored under `admate.analytics-consent`, is shared by
  both apps, and can be changed from **Cookie settings** (website footer,
  dashboard sidebar). Some dashboard events (uploads, recommendations,
  Telegram) are also browser events and follow the same consent.

## Privacy rules

- **Off:** session replay, autocapture, heatmaps, dead clicks, exceptions, web
  vitals, surveys, feature flags and remote scripts.
- **Identity:** signed-in users are identified by their Supabase user ID, and their
  account email is set on their PostHog person (the only personal detail sent;
  never a name). The browser identity is reset on sign-out.
- **Time on page:** `$pageleave` is sent when a page is left, so PostHog can show
  time per page and session length. It follows the same rules as page views.
- **Filter:** every event passes `sanitizeEvent` (`src/lib/analytics/sanitize.ts`,
  kept identical in `dashboard/lib/analytics-sanitize.ts`):
  - URLs and referrers lose their query string and `#…` part.
  - IDs in paths become `:id`.
  - Other sites keep only their origin.
  - Only the events listed below are sent, and only with their listed short-code
    properties.
- **No duplicate page views:** dashboard pages are recorded once (by the server
  for signed-in people, by the browser for demo visitors). The website records
  everything else and drops `/app`, `/auth/callback`, `/home` and `/logout`. A
  page view of the same page straight after itself is dropped too, because some
  pages rewrite their own address.
- **No location lookup:** `$geoip_disable` is set, so PostHog does not derive a
  city or coordinates from the IP. "Discard client IP data" is on in the project.

## Events

| Event | App | Properties |
| --- | --- | --- |
| `$pageview`, `$pageleave` | both (dashboard signed-in: server) | cleaned URL, `app`, `app_env`, visit (`$session_id`); page leave adds time on page |
| `login_completed` | website (after consent) | `method`: `email_code` / `google` |
| `signup_completed` | dashboard server | `method` (first entry into the dashboard) |
| `report_upload_started` | dashboard | `file_type` (fixed list), `size_kb`, `new_account` |
| `report_previewed` | dashboard | `platform`, `level`, `granularity`, `rows` |
| `report_uploaded` | dashboard | `platform`, `level`, `granularity`, `breakdown`, `rows`, `days`, `new_account` |
| `report_upload_failed` | dashboard | `stage`, `reason` (e.g. `http_422`), `size_kb` |
| `report_undone` | dashboard | none |
| `analysis_viewed` | dashboard server (demo visitors: browser) | `account` (`demo` / `sample` / `own`) |
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
- Without a key there is no banner and nothing runs, in the browser or on the server.
- The dashboard database needs migration `0011_user_visits` (one small table)
  before the server-side recording goes live.
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
