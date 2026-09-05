---
name: admate-security
description: "Review or change AdMate secrets, authentication, server boundaries, Supabase access policies, and integration data exposure."
---

# AdMate security and secrets

Read `src/start.ts`, `src/integrations/supabase/`, `src/lib/admate.functions.ts`, `src/lib/ai/explain.server.ts`, and relevant `supabase/migrations/` before changing trust boundaries.

## Project-specific boundaries
- `attachSupabaseAuth` sends the browser session bearer token; it is not authorization. `requireSupabaseAuth` verifies claims but is not applied to current AdMate handlers. Public demo routes and handlers must not be mistaken for tenant-safe live integrations.
- Preserve the explicit CSRF middleware in `src/start.ts`; supplying a custom Start file opts out of the framework's automatic installation. CSRF checking does not replace authentication or ownership checks.
- The server admin Supabase client uses service-role credentials and bypasses RLS. Use verified user context/RLS for user data. Privileged imports belong inside handlers or other `.server.ts` modules, never client components.
- The three demo analytics tables have public SELECT policies; profiles have owner policies. Do not persist private advertiser data until ownership and access policies are explicitly designed and tested.
- Generated Supabase files are marked do-not-edit; prefer supported generation or app-owned wrappers when extending them. Do not discard preview storage behavior as generic boilerplate.

## Secret handling
The repository already tracks `.env` with Supabase connection/publishable configuration. Public client configuration is different from a service-role key, bot token, or model key. Inspect variable names without dumping values. `.gitignore` does not ignore every `.env` filename; never assume a new secret file is excluded. Use ignored `.env.local` for local secrets only after `git check-ignore` confirms it, or the configured deployment secret store. Do not place secrets in `VITE_*` variables, which are client-visible.

Server secret names include `LOVABLE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY`; `TELEGRAM_CHAT_ID` is server recipient configuration. Cron helpers use `LOVABLE_CRON_SECRET` and its previous value, but no scheduled briefing is implemented. Record names and purpose only, never values.

## Review workflow
Trace untrusted input through authorization, downstream calls, logs, and returned errors. Pay special attention to client-supplied Telegram recipients, token-bearing Telegram URLs, AI response excerpts, and cross-tenant query caches. Test denied and cross-user paths with sanitized fixtures. Review staged files by explicit path so credentials and unrelated files are not added. If a real secret is found, report its location/name without reproducing it; coordinate remediation without silently rotating credentials or rewriting published history.
