# Customer landing page and owner sample

Prepared on `codex/customer-landing` from the current main integration. The production website and dashboard have not been changed.

## Landing

Both options use `src/components/landing/LandingPage.tsx`. The homepage uses option A by default. The pricing cards share one plan catalog: Personal shows Starter and Freelancer; Business shows Growth, Pro and Enterprise; See all plans shows all five. Starter lists a planned 15-day trial followed by $9 per month. There is no separate Free plan. Amounts are USD per month, except the separately listed $4 extra-account add-on whose billing interval is unspecified. Plan entitlements and checkout are not wired by this change.

The workflow illustration is made from icons and copy, with no campaigns, metrics or sample reports. Login links in the website use `/login`. The static review deployment links to the existing live login and does not implement a session bridge or host the dashboard.

## Dashboard rollout

The website and dashboard changes should roll out together. Retain the existing sign-in and dashboard bridge settings and confirm that `META_OWNER_USER_ID` on each application matches the verified owner account. `ADMATE_ACCESS=open` is the existing customer registration mode; the sample authorization is independent of it. Customer workspaces start empty and prompt the customer to add an account. Old samples are retained in storage; customer read and action paths no longer expose them. No data was removed and no remote settings or migrations were applied.

## Verification

- The website and dashboard builds passed. Next generated types and dashboard TypeScript passed. Scoped website ESLint passed; repository-wide lint and website TypeScript still report existing errors.
- The 25 dashboard session tests passed on an embedded database with a fake Supabase Auth service.
- The 72 local proxy checks passed, including owner sample, logged-out API denial, customer signup without a sample, account creation, report upload, and account isolation.
- Both hosted options passed 20 browser layout cases across Light/Dark and desktop/mobile widths, plus pricing, workflow, theme persistence, and no public demo paths. The live login route returned HTTP 200; no real account was used in tests.
- Vercel Preview: `dpl_CxzmDRY3BxfpYnVZzEdoWT4FjiJj` on `admate-insights`. Static output contains no backend functions, sample data or credentials. Production deployments and protection settings were verified unchanged. The preview share links expire November 11, 2026 at 16:34 Asia/Phnom_Penh; the links are shared in chat only.
