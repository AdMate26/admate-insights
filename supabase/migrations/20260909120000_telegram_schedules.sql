-- Telegram briefing schedules. Written/read only by server-side code using the
-- service role (Vercel cron + AdMate server functions); RLS is enabled with no
-- anon/authenticated policies so the table is not exposed to the browser.

CREATE TABLE public.telegram_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL UNIQUE,                     -- one active schedule per brand
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('daily', 'weekly', 'monthly')),
  time TEXT NOT NULL,                             -- local wall-clock "HH:MM" (24h)
  timezone TEXT NOT NULL,                         -- IANA tz, e.g. "America/Los_Angeles"
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6),        -- weekly: 0=Sun..6=Sat
  day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 31), -- monthly
  chat_id TEXT,                                   -- optional per-schedule chat override
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_send_at TIMESTAMPTZ,                       -- UTC instant of the next fire
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cron runner selects enabled + due rows on every tick.
CREATE INDEX idx_telegram_schedules_due
  ON public.telegram_schedules (enabled, next_send_at);

ALTER TABLE public.telegram_schedules ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: only the service role (which bypasses RLS)
-- may read or write. This keeps chat ids and schedules off the client.
GRANT ALL ON public.telegram_schedules TO service_role;

-- Keep updated_at fresh on writes.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_telegram_schedules_updated_at
BEFORE UPDATE ON public.telegram_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
