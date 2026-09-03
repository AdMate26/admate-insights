# AdMate Insights

Build "AdMate" — an AI marketing analyst for TikTok Ads.

Core concept: AdMate tells marketers (1) what changed, (2) what actually needs attention, (3) possible explanation, (4) recommended action, (5) evidence, (6) confidence.

Final flow: TikTok Ads data → AdMate analysis → recommendation → Telegram briefing.

Important architectural rule: strictly separate deterministic computation from AI.
- Code (not AI) calculates metrics and classifies findings (anomaly detection, trend breaks, threshold crossings, severity).
- AI is used only to explain findings and write recommendations/confidence framing in natural language, based on the structured output the code already produced. AI must never be the source of the numbers or the classification itself.

Architecture to implement:
1. `DemoTikTokDataProvider` — generates realistic synthetic TikTok Ads data (campaigns, ad sets, ads, daily performance metrics: spend, impressions, clicks, CTR, CPC, CPA, conversions, ROAS, frequency, etc.) over a multi-week period, with some intentional anomalies/trends baked in (e.g. a CPA spike, a CTR drop, a creative fatigue pattern, a budget pacing issue) so the analysis engine has real things to detect. Build it behind a clean data provider interface/contract so it can later be swapped for a `LiveTikTokDataProvider` (real TikTok Ads API) without changing any downstream code. No CSV upload — data is generated internally.
2. A normalization layer that maps whatever the provider returns into one consistent internal schema, so the rest of the app never depends on the provider's raw shape.
3. An analysis engine (deterministic, code-based) that processes normalized data and produces structured findings: what changed, severity/what needs attention, supporting evidence (the actual numbers/comparisons), all computed and classified in code — no AI involved in this step.
4. An AI explanation layer that takes each structured finding and generates: a possible explanation, a recommended action, and a confidence level/reasoning, in natural language. This should use Lovable AI. Make clear in the code/comments that this layer only explains — it does not compute or classify.
5. A recommendation UI/dashboard where marketers can see each finding as a card/entry showing: what changed, why it needs attention, possible explanation, recommended action, evidence, and confidence — clearly organized and easy to scan, prioritized by severity.
6. A Telegram briefing feature: send a digest of the top findings and recommendations to a Telegram chat via a Telegram bot. This should be triggerable manually from the UI for now (e.g. a "Send briefing to Telegram" button), producing a well-formatted summary message.

Please set up Lovable Cloud for the database (storing synthetic data, findings, analysis history) and edge functions (for running the analysis engine and calling the AI + Telegram). Use Lovable AI for the explanation/recommendation layer. For Telegram, use a bot token stored as a secret and ask me for it when needed.

Design: clean, professional analytics/dashboard aesthetic — this is a tool for marketers making decisions, so prioritize clarity and scannability over decoration.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96aef61e-4d2a-4a55-8eac-a41a113ccca1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
