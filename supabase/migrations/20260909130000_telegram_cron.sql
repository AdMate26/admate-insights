-- Supabase Cron (pg_cron) + pg_net scheduler for Telegram briefings.
--
-- Replaces Vercel Cron: the Vercel Hobby plan can only run a cron once per day,
-- which cannot support user-selected daily/weekly/monthly times. Supabase pg_cron
-- can run every few minutes, so the periodic trigger lives here. Every 5 minutes
-- it securely calls the existing Vercel endpoint (/api/cron/run-schedules), which
-- reads due schedules from public.telegram_schedules and sends via the existing
-- server-side Telegram logic (bot token stays on Vercel). Timezone + duplicate
-- protection are unchanged (handled by next_send_at / last_sent_at).
--
-- Secrets are NOT stored in this migration. They live in Supabase Vault and are
-- created once by you (see docs/telegram-scheduling.md):
--   select vault.create_secret('https://YOUR-APP.vercel.app', 'admate_cron_endpoint_url');
--   select vault.create_secret('YOUR_CRON_SECRET',            'admate_cron_secret');
-- (admate_cron_secret must equal the CRON_SECRET env var set on Vercel.)

-- Extensions (Supabase may require enabling these via Dashboard → Database →
-- Extensions if the migration role lacks privilege; both are then no-ops here).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Calls the Vercel "run due schedules" endpoint with the bearer secret. Reads the
-- endpoint URL + secret from Vault so no secret is ever written into SQL/cron.
create or replace function public.run_due_telegram_schedules()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text;
  v_secret   text;
begin
  select decrypted_secret into v_endpoint
    from vault.decrypted_secrets where name = 'admate_cron_endpoint_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'admate_cron_secret';

  if v_endpoint is null or v_secret is null then
    raise notice 'AdMate: cron secrets not configured in Vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_endpoint, '/') || '/api/cron/run-schedules',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- (Re)schedule the 5-minute checker. Unschedule first so re-running is safe.
select cron.unschedule('admate-telegram-scheduler')
  where exists (select 1 from cron.job where jobname = 'admate-telegram-scheduler');

select cron.schedule(
  'admate-telegram-scheduler',
  '*/5 * * * *',
  $$ select public.run_due_telegram_schedules(); $$
);
