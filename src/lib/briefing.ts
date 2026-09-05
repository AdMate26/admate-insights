import type { AnalysisResult, CampaignFinding, Signal } from "./analysis/engine";
import { type Platform } from "./platforms";
import { isCheckData, isEarlyData, isFair, isNeedsAttention } from "./attention";

/**
 * Pure Telegram briefing builder (no server/runtime imports) so it is unit
 * testable. The Telegram DELIVERY mechanism lives in admate.functions and is
 * unchanged — this only produces the message TEXT.
 *
 * The briefing is CROSS-PLATFORM: one summary counting only campaigns whose
 * Performance Rating is exactly "Needs Attention", then full details for those
 * campaigns only. Check Data is listed separately; Fair + Early Data are shown as
 * compact counts; Good + Very Good are omitted. No new metrics or
 * recommendations are invented — it only reformats existing engine output and the
 * approved AI / guidance recommendation.
 */
export type BriefingInput = Pick<
  AnalysisResult,
  "currentWindow" | "previousWindow" | "totalSpend" | "findings"
> & { platform: Platform };

/** Short platform names used in the briefing (as specified for the summary). */
const SHORT_LABEL: Record<Platform, string> = {
  tiktok: "TikTok Ads",
  meta: "Meta Ads",
  google_search: "Google Search",
};
const PLATFORM_ORDER: Platform[] = ["tiktok", "meta", "google_search"];

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One short, plain-English sentence per signal — what is going wrong. */
const WHATS_WRONG: Record<Signal, string> = {
  creative_fatigue: "Your audience is getting tired of these ads.",
  cpa_deterioration: "Your results are costing more than they used to.",
  cpm_spike: "It is getting more expensive just to show these ads.",
  ctr_drop: "Fewer people are clicking your ads.",
  tracking_issue: "Your conversion tracking may not be recording sales properly.",
  low_volume: "There is not enough data yet to judge this campaign.",
  insufficient_comparison: "This campaign is too new to compare with last week.",
  lost_impression_share: "Your ads are missing searches they could be winning.",
  scaling_efficiency: "Spend is growing while results stay efficient.",
  strong_improvement: "This campaign is performing better than last week.",
  stable: "This campaign is steady with no major change.",
};

type MetricKind =
  | "ctr"
  | "frequency"
  | "cpa"
  | "cpm"
  | "cpc"
  | "cvr"
  | "roas"
  | "convvalue"
  | "impressionshare"
  | "lostbudget"
  | "lostrank"
  | "conversions"
  | "clicks"
  | "impressions"
  | "reach"
  | "spend"
  | null;

function kindOf(label: string): MetricKind {
  const l = label.toLowerCase();
  if (l.includes("ctr")) return "ctr";
  if (l.includes("frequency")) return "frequency";
  if (l.includes("cost per result") || l.includes("cost per conversion") || l.includes("(cpa)"))
    return "cpa";
  if (l.includes("cpm")) return "cpm";
  if (l.includes("cpc")) return "cpc";
  if (l.includes("cvr")) return "cvr";
  if (l.includes("roas")) return "roas";
  if (l.includes("conversion value")) return "convvalue";
  if (l.includes("impression share")) return "impressionshare";
  if (l.includes("lost is (budget)")) return "lostbudget";
  if (l.includes("lost is (rank)")) return "lostrank";
  if (l.includes("results") || l.includes("conversions")) return "conversions";
  if (l.includes("clicks")) return "clicks";
  if (l.includes("impressions")) return "impressions";
  if (l.includes("reach")) return "reach";
  if (l.includes("spend")) return "spend";
  return null;
}

function displayLabel(kind: Exclude<MetricKind, null>): string {
  switch (kind) {
    case "cpa":
      return "CPA";
    case "cpc":
      return "CPC";
    case "convvalue":
      return "Sale value";
    case "impressionshare":
      return "Impression share";
    case "lostbudget":
      return "Lost to budget";
    case "lostrank":
      return "Lost to ad rank";
    case "conversions":
      return "Results";
    case "ctr":
      return "CTR";
    case "cpm":
      return "CPM";
    case "cvr":
      return "Conversion rate";
    case "roas":
      return "ROAS";
    case "clicks":
      return "Clicks";
    case "impressions":
      return "Impressions";
    case "reach":
      return "Reach";
    case "frequency":
      return "Frequency";
    case "spend":
      return "Spend";
  }
}

function meaning(kind: Exclude<MetricKind, null>, up: boolean): string {
  switch (kind) {
    case "ctr":
      return up ? "more people are clicking" : "fewer people are clicking";
    case "frequency":
      return up ? "people are seeing the ads more often" : "people are seeing the ads less often";
    case "cpa":
      return up ? "each result costs more" : "each result costs less";
    case "cpm":
      return up ? "it costs more to show the ads" : "it costs less to show the ads";
    case "cpc":
      return up ? "each click costs more" : "each click costs less";
    case "cvr":
      return up ? "more clicks turn into results" : "fewer clicks turn into results";
    case "roas":
      return up ? "more revenue per dollar spent" : "less revenue per dollar spent";
    case "convvalue":
      return up ? "each sale is worth more" : "each sale is worth less";
    case "impressionshare":
      return up ? "ads show on more searches" : "ads show on fewer searches";
    case "lostbudget":
      return up ? "budget is limiting how often ads show" : "budget is limiting ads less";
    case "lostrank":
      return up ? "ad rank is limiting how often ads show" : "ad rank is limiting ads less";
    case "conversions":
      return up ? "more results" : "fewer results";
    case "clicks":
      return up ? "more clicks" : "fewer clicks";
    case "impressions":
      return up ? "the ads are showing more" : "the ads are showing less";
    case "reach":
      return up ? "reaching more people" : "reaching fewer people";
    case "spend":
      return up ? "spending more" : "spending less";
  }
}

/** Up to 3 translated evidence lines, most important first. Spend is excluded (redundant with header). */
function keyEvidence(f: CampaignFinding): string[] {
  const candidates = f.evidence.metrics
    .map((m) => ({ m, kind: kindOf(m.label) }))
    .filter(
      (x): x is { m: (typeof f.evidence.metrics)[number]; kind: Exclude<MetricKind, null> } =>
        x.kind !== null &&
        x.kind !== "spend" &&
        x.m.changePct !== null &&
        Math.round(Math.abs(x.m.changePct)) >= 1,
    );

  candidates.sort((a, b) => {
    if (a.m.primary && !b.m.primary) return -1;
    if (b.m.primary && !a.m.primary) return 1;
    return Math.abs(b.m.changePct!) - Math.abs(a.m.changePct!);
  });

  const seen = new Set<MetricKind>();
  const out: string[] = [];
  for (const { m, kind } of candidates) {
    if (seen.has(kind)) continue; // avoid repeated metrics
    seen.add(kind);
    const up = m.changePct! > 0;
    const pct = Math.round(Math.abs(m.changePct!));
    out.push(`${displayLabel(kind)} ${up ? "↑" : "↓"}${pct}% — ${meaning(kind, up)}`);
    if (out.length === 3) break;
  }
  return out;
}

/** "What to do now": the approved primary action, then at most 2 short steps. */
function whatToDo(f: CampaignFinding): { action: string; steps: string[] } {
  const action =
    f.guidance?.action ?? f.aiRecommendedAction ?? "Review this campaign before making changes.";
  const steps = (f.guidance?.steps ?? []).slice(0, 2);
  return { action, steps };
}

/** Full plain-language block for a single Needs Attention campaign. */
function detailBlock(platform: Platform, f: CampaignFinding): string[] {
  const score = f.performanceScore !== null ? ` · ${f.performanceScore}` : "";
  const { action, steps } = whatToDo(f);
  return [
    "",
    "──────────",
    `🔴 <b>${escapeHtml(SHORT_LABEL[platform])} — ${escapeHtml(f.campaignName)}</b>`,
    `${escapeHtml(f.performanceLabel)}${score}`,
    "",
    "<b>WHAT'S GOING WRONG</b>",
    escapeHtml(WHATS_WRONG[f.signal]),
    "",
    "<b>KEY EVIDENCE</b>",
    ...keyEvidence(f).map((line) => escapeHtml(line)),
    "",
    "<b>WHAT TO DO NOW</b>",
    escapeHtml(action),
    ...steps.map((s) => `• ${escapeHtml(s)}`),
    "",
    `Confidence: ${f.confidence}`,
  ];
}

export function buildBriefing(platforms: BriefingInput[]): string {
  const ordered = [...platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );

  const naByPlatform = new Map<Platform, CampaignFinding[]>();
  let totalNA = 0;
  let checkData: { platform: Platform; f: CampaignFinding }[] = [];
  let fairCount = 0;
  let earlyCount = 0;

  for (const p of ordered) {
    const na = p.findings.filter(isNeedsAttention);
    naByPlatform.set(p.platform, na);
    totalNA += na.length;
    for (const f of p.findings) {
      if (isCheckData(f)) checkData.push({ platform: p.platform, f });
      else if (isFair(f)) fairCount += 1;
      else if (isEarlyData(f)) earlyCount += 1;
    }
  }

  // Summary — counts come ONLY from Performance Rating = Needs Attention.
  const lines: string[] = [
    "<b>AdMate Briefing</b>",
    "",
    `🔴 <b>${totalNA} ${totalNA === 1 ? "campaign needs" : "campaigns need"} attention</b>`,
  ];
  for (const p of ordered) {
    lines.push(`${SHORT_LABEL[p.platform]}: ${naByPlatform.get(p.platform)!.length}`);
  }

  // Full details — Needs Attention campaigns only.
  for (const p of ordered) {
    for (const f of naByPlatform.get(p.platform)!) {
      lines.push(...detailBlock(p.platform, f));
    }
  }

  // Check Data — listed separately, never counted as Needs Attention.
  if (checkData.length > 0) {
    lines.push("", "──────────", "⚠️ <b>Data Check</b>");
    for (const { platform, f } of checkData) {
      lines.push(`${escapeHtml(SHORT_LABEL[platform])} — ${escapeHtml(f.campaignName)}`);
    }
  }

  // Fair + Early Data — compact counts only.
  if (fairCount > 0 || earlyCount > 0) {
    lines.push("", `Monitoring — Fair: ${fairCount} · Early Data: ${earlyCount}`);
  }

  return lines.join("\n");
}

/** Plain-text render of the same digest (Telegram preview before connecting). */
export function briefingPlainText(platforms: BriefingInput[]): string {
  return buildBriefing(platforms)
    .replace(/<\/?(b|i)>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
