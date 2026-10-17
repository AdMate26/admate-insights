# Meta Marketing API (read-only, owner-only)

AdMate can show the owner's real Meta ad account as a separate **My Account**
brand in the signed-in workspace (`/home`). This first stage is read-only and
uses only the `ads_read` permission.

## What it does

All Meta calls run on the server. When the verified owner opens My Account:

1. The configured ad account is read (`GET /act_{id}`): id, name, status,
   currency and timezone.
2. Campaigns are listed (`GET /act_{id}/campaigns`).
3. Only if campaigns exist: ad sets (`GET /act_{id}/adsets`) and daily campaign
   insights for the last 14 complete account-local days
   (`GET /act_{id}/insights?level=campaign&time_increment=1`).
4. Results are mapped to the existing `CampaignInput` shape
   (`src/lib/meta/mapping.ts`) and graded by the unchanged analysis engine.

An account with zero campaigns, or no delivery in the window, is a successful
connection with an empty result. No sample data is ever shown for My Account.

## Who can see it

- `/demo` is public and always synthetic. It never lists or accepts My Account.
- Live data is returned only when the request's Supabase access token is valid
  (checked with the Supabase Auth server) **and** belongs to the user whose id
  equals `META_OWNER_USER_ID`. Everyone else gets no live data; non-owners are
  redirected to a demo brand and never see My Account in the sidebar.
- Northlane, Olive and Kite are unchanged and keep using synthetic data.

## Environment variables (server-only, set in Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | yes | Token with `ads_read`. Store as a secret. |
| `META_AD_ACCOUNT_ID` | yes | Numeric id, with or without `act_`. |
| `META_OWNER_USER_ID` | yes | Supabase user id allowed to see live data. |
| `META_APP_SECRET` | no | Adds `appsecret_proof` to every request. |
| `META_API_VERSION` | no | Graph API version, e.g. `v24.0` (the default). |

The server-side owner check uses the public `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (the same project the browser signs in to).

None of these values are hard-coded, and none are sent to the browser.

## Errors

Meta failures are shown on the My Account screen as fixed, human-readable
messages; Meta's raw error text and the token are never displayed or logged.

| Kind | Typical cause |
| --- | --- |
| `not_configured` | A required variable is missing or malformed. |
| `token_invalid` | Token expired, revoked or invalid (Graph code 190). Replace `META_ACCESS_TOKEN`. |
| `permission` | Token lacks `ads_read` or access to the account. |
| `not_found` | The ad account id doesn't exist or isn't visible. |
| `rate_limited` | Meta throttling. Retry later. |
| `unavailable` | Network/timeout or a Meta outage. |

Server logs record only the kind, HTTP status, Graph code/subcode and trace id.

## Not included yet

`ads_management`, editing/pausing/creating campaigns, customer OAuth, Telegram
briefings for live data, AI explanations for live data, and campaign detail
pages for live campaigns.
