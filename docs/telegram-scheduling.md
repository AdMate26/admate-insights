# Telegram briefing scheduler (Supabase Cron → Vercel endpoint)

Scheduled Telegram briefings are triggered by **Supabase Cron (pg_cron + pg_net)**,
not Vercel Cron. The Vercel **Hobby** plan can only run a cron once per day, which
can't support user-selected daily/weekly/monthly times. Supabase pg_cron runs
every 5 minutes and calls the existing Vercel endpoint, which does the real work.

## Flow

```
Supabase pg_cron (every 5 min)
  → public.run_due_telegram_schedules()   (pg_net POST, Bearer CRON_SECRET)
    → https://YOUR-APP.vercel.app/api/cron/run-schedules   (Vercel Function, Hobby-OK)
      → runDueSchedules(): reads public.telegram_schedules where enabled and
        next_send_at <= now(), builds the briefing (shared generator), sends via
        the existing Telegram logic, then advances last_sent_at / next_send_at.
```

- **Telegram send + briefing generation are unchanged** — the endpoint reuses
  `src/lib/telegram/dispatch.server.ts` (same content as Preview Message & Send Now).
- **Duplicate protection**: a schedule only fires when `next_send_at <= now`; after
  a successful send `next_send_at` rolls forward via the timezone-aware
  `computeNextRun`, so repeated 5-minute checks never double-send.
- **Timezone**: each schedule stores an explicit IANA timezone; `next_send_at` is
  the UTC instant of the user's local time — unchanged by this migration.
- **Send Now** and **Preview Message** are independent of all of this.

## Endpoint

`GET|POST /api/cron/run-schedules` — requires header `Authorization: Bearer <CRON_SECRET>`.
Returns `{ ok, checked, sent, results }`. Rejects unauthenticated calls (401).

## Environment variables (Vercel, server-side)

Set in Vercel → Project → Settings → Environment Variables (Production + Preview):

| Variable | Purpose |
| --- | --- |
| `CRON_SECRET` | Shared secret the scheduler must present. **Must equal** the Vault `admate_cron_secret`. |
| `TELEGRAM_BOT_TOKEN` | Bot token (already used by Send Now). |
| `TELEGRAM_CHAT_ID` | Optional default chat id. |
| `SUPABASE_URL` | Already set. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set; the endpoint reads/writes `telegram_schedules` with it. |

No secret is exposed to the frontend.

## Supabase setup (one time)

1. **Apply the migrations** (via Supabase CLI `supabase db push`, or paste into the
   SQL editor):
   - `supabase/migrations/20260909120000_telegram_schedules.sql` (the table)
   - `supabase/migrations/20260909130000_telegram_cron.sql` (extensions + cron)

2. **If the cron migration errors on `create extension`** (insufficient privilege),
   enable the two extensions in the Dashboard → **Database → Extensions**:
   `pg_cron` and `pg_net`. Then re-run the rest of `..._telegram_cron.sql`.

3. **Store the endpoint URL + secret in Vault** (Dashboard → SQL editor). These are
   read by the cron function; they are never written into SQL/cron history:

   ```sql
   select vault.create_secret('https://YOUR-APP.vercel.app', 'admate_cron_endpoint_url');
   select vault.create_secret('YOUR_CRON_SECRET',            'admate_cron_secret');
   ```

   Use your real Vercel production URL and the same value as the Vercel `CRON_SECRET`.
   To rotate later: `select vault.update_secret((select id from vault.secrets where name='admate_cron_secret'), 'NEW_VALUE');`

4. **Confirm the job is scheduled:**

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'admate-telegram-scheduler';
   ```

## How to test a scheduled Telegram message

1. In the app → **Briefings** → **Telegram Send & Schedule** → **Daily**, set a time
   ~2–3 minutes ahead, **Save Schedule**. Confirm the summary (e.g. "Every day at
   9:05 AM") appears with **Edit / Disable**.
2. Wait for the next 5-minute pg_cron tick (or fire it immediately in SQL:
   `select public.run_due_telegram_schedules();`). The briefing should arrive in
   Telegram.
3. Verify no double-send: run the function again immediately — it should send
   nothing (the row's `next_send_at` has already advanced).
   - Inspect: `select brand, delivery_type, time, timezone, next_send_at, last_sent_at from public.telegram_schedules;`
   - Inspect HTTP calls pg_net made: `select * from net._http_response order by created desc limit 5;`
4. Manual endpoint check (should be 401 without the secret, 200 with it):

   ```bash
   curl -i https://YOUR-APP.vercel.app/api/cron/run-schedules                       # 401
   curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" \
        https://YOUR-APP.vercel.app/api/cron/run-schedules                          # 200 {"ok":true,...}
   ```

**Note:** the scheduler executes server-to-server (Supabase → Vercel), so the
browser does not need to stay open. Vercel Cron is no longer used, so the Hobby
deployment builds normally.
