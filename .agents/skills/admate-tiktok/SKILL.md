---
name: admate-tiktok
description: "Maintain AdMate synthetic TikTok data or implement a requested live TikTok Ads provider behind the existing normalization contract."
---

# AdMate TikTok data integration

## Current state
Only `DemoTikTokDataProvider` exists. `/connect` is a placeholder; there is no implemented TikTok OAuth or live report fetcher. Read `src/lib/tiktok/contract.ts`, `demo-provider.ts`, `normalize.ts`, and the provider construction in `src/lib/admate.functions.ts`.

## Provider workflow
1. Preserve `AdsDataProvider` (`id`, `label`, `fetchDailyPerformance`, `normalizeRow`) and downstream `NormalizedDailyRow` where practical. Keep raw API fields inside the adapter.
2. For demo work, preserve deterministic date/campaign seeding, UTC complete-day generation, synthetic labels, and representative cases. Verify numeric behavior rather than treating scenario names as expected engine output.
3. For requested live work, consult current official TikTok Business API documentation for the actual endpoint, permissions, report grain, field meaning, pagination, rate limits, and authentication. The demo's API-like raw names are not a verified API schema: `total_complete_payment_rate` is used as synthetic revenue here and must not be blindly reused as live revenue.
4. Define advertiser/account identity, timezone, currency, attribution window, conversion event, missing-data semantics, and stable campaign/ad-group/ad identifiers before normalizing. The current schema lacks account/currency fields; surface needed contract changes explicitly instead of mixing accounts or currencies.
5. Decide how to handle multiple ad rows per day, duplicates across pages, delayed conversions, and non-additive reach. Current normalizer only checks nonempty date and finite spend; do not assume complete validation. The engine's completeness calculation counts rows.
6. Keep OAuth secrets and access/refresh tokens server-side. Use server authorization and tenant ownership before live data access; existing public demo policies are not suitable for private advertiser data.

## Validate
Use sanitized fixtures for string-to-number mapping, invalid values, empty/partial reports, pagination duplicates, dates, and authorization failures. Compare normalized output and engine results without touching a live ad account. A data-provider task does not authorize changing campaigns or budgets. Preserve a working demo when adding a live provider, and label its provenance accurately.
