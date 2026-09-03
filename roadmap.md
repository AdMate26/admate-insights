# AdMate roadmap

## MVP (done)
- [x] `DemoTikTokDataProvider` behind a swappable provider contract (synthetic TikTok Ads data)
- [x] Normalization layer → single internal schema
- [x] Deterministic engine: campaign-level, latest 7 complete days vs preceding 7 complete days
- [x] Deterministic signals: CPA deterioration, CTR drop, possible creative fatigue, scaling efficiency,
      strong improvement, stable, low volume, possible tracking issue, CPM spike
- [x] Deterministic confidence (High/Medium/Low) from volume, consistency, magnitude, data completeness
- [x] AI writes ONLY: Possible Explanation + Recommended Action
- [x] Campaign list view (name, status, spend, CTR, conversions, cost per result)
- [x] Campaign analysis view: STATUS → WHAT CHANGED → POSSIBLE EXPLANATION → RECOMMENDED ACTION
      (focal point) → EVIDENCE → CONFIDENCE
- [ ] Telegram briefing: code done, awaiting bot token secret from the user

## Deferred (not in MVP)
- Persistence of runs/findings/history (Cloud tables exist but MVP runs in-memory)
- Charts / full analytics dashboard
- `LiveTikTokDataProvider` against the real TikTok Ads API
- Scheduled/automatic briefings

## Auth (done)
- [x] Email/password sign up (name stored in `profiles`), login, forgot password, reset-password page, logout
- [x] App pages gated under `_authenticated`; logged-out visitors land on `/auth`, login goes to `/home`
