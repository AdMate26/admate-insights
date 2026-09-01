# AdMate roadmap

## MVP (in progress)
- [x] `DemoTikTokDataProvider` behind a swappable provider contract (synthetic TikTok Ads data)
- [x] Normalization layer → single internal schema
- [ ] Deterministic engine: campaign-level, latest 7 complete days vs preceding 7 complete days
- [ ] Deterministic signals: CPA deterioration, CTR drop, possible creative fatigue, scaling efficiency,
      strong improvement, stable, low volume, possible tracking issue, CPM spike
- [ ] Deterministic confidence (High/Medium/Low) from volume, consistency, magnitude, data completeness
- [ ] AI writes ONLY: Possible Explanation + Recommended Action
- [ ] Focused campaign findings/recommendation view (minimal navigation, no full dashboard)
- [ ] Telegram briefing button (bot token secret)

## Deferred (not in MVP)
- Persistence of runs/findings/history (tables exist but MVP runs in-memory)
- Charts / full analytics dashboard
- `LiveTikTokDataProvider` against the real TikTok Ads API
- Scheduled/automatic briefings
