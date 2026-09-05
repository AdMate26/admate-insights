---
name: admate-telegram
description: "Develop or debug AdMate Telegram briefing formatting, preview, delivery, and UI feedback without accidental sends."
---

# AdMate Telegram briefings

Read `buildBriefing`, `previewBriefing`, and `sendTelegramBriefing` in `src/lib/admate.functions.ts`, plus the controls in `src/routes/campaigns.$campaignId.tsx`.

## Current behavior
- The manual POST sender reads server-only `TELEGRAM_BOT_TOKEN`; a trimmed input chat ID overrides `TELEGRAM_CHAT_ID`.
- It regenerates analysis and sends the first five `needsAttention` findings in engine order. It is a whole-analysis digest, even when triggered from one campaign's page.
- Telegram receives HTML with escaped dynamic names/narratives and optional AI text. Confidence remains deterministic. The preview removes formatting and does not send, but still regenerates analysis and may call AI.
- There is no scheduler, webhook, retry loop, or queue. Secret configuration and successful delivery cannot be inferred from the presence of code.

## Workflow and checks
Keep rendering and selection consistent between preview and send. Preserve HTML escaping (`&`, `<`, `>`) and missing-narrative/no-attention behavior. Check non-2xx HTTP status and Telegram's JSON `ok` separately. UI loading states must settle on both success and failure.

Use mocked fetch for token/chat-ID absence, explicit ID vs fallback, API rejection, network/JSON errors, long narratives, Unicode, and escaping. Before adding chunking, consult current official Telegram Bot API limits and keep each message's markup valid; do not truncate through HTML tags. Retries can duplicate messages after ambiguous delivery, so bound them and handle uncertainty explicitly.

Do not log the bot URL containing the token. Sending to a real chat requires an explicit user request covering the recipient; existing authorization can satisfy it. Otherwise validate through fixtures/preview with AI mocked, and report that delivery was not exercised. Scheduled briefing work also needs a deliberate authenticated trigger and duplicate-delivery design.
