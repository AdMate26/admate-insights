import { createServerFn } from "@tanstack/react-start";

import { runAnalysis, type Finding, type FindingEvidence } from "./analysis/engine";
import { DemoTikTokDataProvider } from "./tiktok/demo-provider";
import { loadNormalizedDailyRows } from "./tiktok/normalize";

const DAYS = 28;

export type FindingRecord = {
  id: string;
  code: string;
  entity_level: string;
  entity_id: string;
  entity_name: string;
  metric: string;
  severity: "critical" | "high" | "medium" | "low";
  severity_score: number;
  title: string;
  what_changed: string;
  why_it_matters: string;
  evidence: FindingEvidence;
  ai_explanation: string | null;
  ai_recommended_action: string | null;
  ai_confidence: string | null;
  ai_confidence_reason: string | null;
};

export type RunRecord = {
  id: string;
  window_start: string;
  window_end: string;
  provider: string;
  findings_count: number;
  total_spend: number;
  summary: string | null;
  ai_status: string;
  created_at: string;
};

export type DashboardPayload = {
  run: RunRecord | null;
  findings: FindingRecord[];
  trend: { date: string; spend: number; conversions: number; cpa: number }[];
};

function summarize(findings: Finding[], totalSpend: number): string {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  return `${findings.length} findings across ${DAYS} days of delivery ($${totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} spend): ${critical} critical, ${high} high priority.`;
}

/** Regenerates demo data, runs the deterministic engine, then adds AI narratives. */
export const runAdMateAnalysis = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const provider = new DemoTikTokDataProvider();

  // 1 + 2. Provider -> normalization layer -> internal schema.
  const rows = await loadNormalizedDailyRows(provider, DAYS);

  await supabaseAdmin.from("ad_performance_daily").delete().neq("campaign_id", "__none__");
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      date: r.date,
      campaign_id: r.campaignId,
      campaign_name: r.campaignName,
      adset_id: r.adsetId,
      adset_name: r.adsetName,
      ad_id: r.adId,
      ad_name: r.adName,
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      revenue: r.revenue,
      reach: r.reach,
      daily_budget: r.dailyBudget,
    }));
    const { error } = await supabaseAdmin.from("ad_performance_daily").insert(chunk);
    if (error) throw new Error(`Failed to store performance data: ${error.message}`);
  }

  // 3. Deterministic analysis (all numbers + classification happen here).
  const result = runAnalysis(rows);

  const { data: run, error: runError } = await supabaseAdmin
    .from("analysis_runs")
    .insert({
      window_start: result.windowStart,
      window_end: result.windowEnd,
      provider: provider.id,
      findings_count: result.findings.length,
      total_spend: result.totalSpend,
      summary: summarize(result.findings, result.totalSpend),
      ai_status: "pending",
    })
    .select()
    .single();
  if (runError || !run) throw new Error(`Failed to create run: ${runError?.message}`);

  const { data: inserted, error: findingsError } = await supabaseAdmin
    .from("findings")
    .insert(
      result.findings.map((f) => ({
        run_id: run.id,
        code: f.code,
        entity_level: f.entityLevel,
        entity_id: f.entityId,
        entity_name: f.entityName,
        metric: f.metric,
        severity: f.severity,
        severity_score: f.severityScore,
        title: f.title,
        what_changed: f.whatChanged,
        why_it_matters: f.whyItMatters,
        evidence: f.evidence,
      })),
    )
    .select();
  if (findingsError) throw new Error(`Failed to store findings: ${findingsError.message}`);

  // 4. AI layer: explanation / recommendation / confidence only.
  let aiStatus = "ok";
  let aiError: string | null = null;
  try {
    const { explainFindings } = await import("./ai/explain.server");
    const narratives = await explainFindings(result.findings);
    for (const row of inserted ?? []) {
      const n = narratives.find((x) => x.code === row.code && x.entityId === row.entity_id);
      if (!n) continue;
      await supabaseAdmin
        .from("findings")
        .update({
          ai_explanation: n.explanation,
          ai_recommended_action: n.recommendedAction,
          ai_confidence: n.confidence,
          ai_confidence_reason: n.confidenceReason,
        })
        .eq("id", row.id);
    }
  } catch (error) {
    aiStatus = "failed";
    aiError = error instanceof Error ? error.message : String(error);
    console.error("AI explanation layer failed", error);
  }

  await supabaseAdmin.from("analysis_runs").update({ ai_status: aiStatus }).eq("id", run.id);

  return { runId: run.id as string, findings: result.findings.length, aiStatus, aiError };
});

export const getDashboardData = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: runs } = await supabaseAdmin
      .from("analysis_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    const run = (runs?.[0] as RunRecord | undefined) ?? null;
    if (!run) return { run: null, findings: [], trend: [] };

    const { data: findings } = await supabaseAdmin
      .from("findings")
      .select("*")
      .eq("run_id", run.id)
      .order("severity_score", { ascending: false });

    const { data: perf } = await supabaseAdmin
      .from("ad_performance_daily")
      .select("date, spend, conversions")
      .order("date", { ascending: true });

    const byDate = new Map<string, { spend: number; conversions: number }>();
    for (const row of perf ?? []) {
      const key = row.date as string;
      const agg = byDate.get(key) ?? { spend: 0, conversions: 0 };
      agg.spend += Number(row.spend);
      agg.conversions += Number(row.conversions);
      byDate.set(key, agg);
    }
    const trend = [...byDate.entries()].map(([date, v]) => ({
      date,
      spend: Number(v.spend.toFixed(2)),
      conversions: v.conversions,
      cpa: v.conversions > 0 ? Number((v.spend / v.conversions).toFixed(2)) : 0,
    }));

    return { run, findings: (findings ?? []) as FindingRecord[], trend };
  },
);

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildBriefing(run: RunRecord, findings: FindingRecord[]): string {
  const top = findings.slice(0, 5);
  const lines: string[] = [
    `<b>AdMate briefing — TikTok Ads</b>`,
    `${escapeHtml(run.window_start)} → ${escapeHtml(run.window_end)}`,
    `Spend analysed: $${Number(run.total_spend).toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${run.findings_count} findings`,
    "",
  ];
  top.forEach((f, i) => {
    lines.push(
      `${SEVERITY_ICON[f.severity] ?? "⚪"} <b>${i + 1}. ${escapeHtml(f.title)}</b>`,
      `<i>What changed:</i> ${escapeHtml(f.what_changed)}`,
      `<i>Evidence:</i> ${escapeHtml(f.evidence.metric)} ${f.evidence.previous} → ${f.evidence.current} (${f.evidence.changePct > 0 ? "+" : ""}${f.evidence.changePct}%), $${f.evidence.spendInWindow.toLocaleString("en-US", { maximumFractionDigits: 0 })} spend in window`,
    );
    if (f.ai_explanation) lines.push(`<i>Possible cause:</i> ${escapeHtml(f.ai_explanation)}`);
    if (f.ai_recommended_action)
      lines.push(`<i>Recommended:</i> ${escapeHtml(f.ai_recommended_action)}`);
    if (f.ai_confidence) lines.push(`<i>Confidence:</i> ${escapeHtml(f.ai_confidence)}`);
    lines.push("");
  });
  lines.push("Numbers and severities are computed deterministically; AI wrote the interpretation.");
  return lines.join("\n");
}

export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: { chatId?: string }) => ({ chatId: input?.chatId?.trim() || undefined }))
  .handler(async ({ data }) => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) {
      return { ok: false as const, error: "TELEGRAM_BOT_TOKEN is not configured." };
    }
    const chatId = data.chatId ?? process.env["TELEGRAM_CHAT_ID"];
    if (!chatId) {
      return { ok: false as const, error: "No Telegram chat ID provided." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: runs } = await supabaseAdmin
      .from("analysis_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    const run = runs?.[0] as RunRecord | undefined;
    if (!run) return { ok: false as const, error: "Run an analysis first." };

    const { data: findings } = await supabaseAdmin
      .from("findings")
      .select("*")
      .eq("run_id", run.id)
      .order("severity_score", { ascending: false });

    const text = buildBriefing(run, (findings ?? []) as FindingRecord[]);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const body = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !body.ok) {
      return { ok: false as const, error: body.description ?? `Telegram error ${response.status}` };
    }
    return { ok: true as const, sent: Math.min(5, findings?.length ?? 0) };
  });
