CREATE TABLE public.ad_performance_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  daily_budget NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_perf_date ON public.ad_performance_daily (date);
GRANT SELECT ON public.ad_performance_daily TO anon, authenticated;
GRANT ALL ON public.ad_performance_daily TO service_role;
ALTER TABLE public.ad_performance_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Demo performance data is publicly readable" ON public.ad_performance_daily FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.analysis_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'demo',
  findings_count INTEGER NOT NULL DEFAULT 0,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  summary TEXT,
  ai_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analysis_runs TO anon, authenticated;
GRANT ALL ON public.analysis_runs TO service_role;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Analysis runs are publicly readable" ON public.analysis_runs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  metric TEXT NOT NULL,
  severity TEXT NOT NULL,
  severity_score NUMERIC NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  what_changed TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_explanation TEXT,
  ai_recommended_action TEXT,
  ai_confidence TEXT,
  ai_confidence_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_findings_run ON public.findings (run_id);
GRANT SELECT ON public.findings TO anon, authenticated;
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Findings are publicly readable" ON public.findings FOR SELECT TO anon, authenticated USING (true);