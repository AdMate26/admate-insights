import type { AnalysisResult, CampaignFinding, Signal } from "./analysis/engine";
import { platformMeta, type Platform } from "./platforms";

/**
 * Pure Telegram briefing builder (no server/runtime imports) so it is unit
 * testable. The Telegram DELIVERY mechanism lives in admate.functions and is
 * unchanged — this only produces the message TEXT for the selected platform.
 *
 * Wording goal: a non-technical marketer should grasp, within seconds, what is
 * wrong, why it matters, and what to do now. It only reformats data the engine
 * already produced (findings, evidence metrics) and the approved AI / guidance
 * recommendation — no new metrics or recommendations are invented here.
 */
export type BriefingInput = Pick<
  AnalysisResult,
  "currentWindow" | "previousWindow" | "totalSpend" | "findings"
> & { platform: Platform };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Positive signals we never flag as "needing action" in the briefing. */
const NON_ACTIONABLE: ReadonlySet<Signal> = new Set<Signal>([
  "stable",
  "strong_improvement",
  "scaling_efficiency",
]);

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

/** Emoji per performance rating, for fast scanning. */
function ratingEmoji(finding: CampaignFinding): string {
  if (finding.performanceRating === "Needs Attention") return "🔴";
  if (finding.performanceRating === "Fair") return "🟠";
  if (finding.performanceRating === "Good" || finding.performanceRating === "Very Good") return "🟢";
  return "⚪"; // Early Data / Check Data
}

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

/** Short display token + plain-English meaning for each metric movement. */
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

/** Up to 3 translated evidence lines, most important first. Spend is excluded (it is in the header). */
function keyEvidence(f: CampaignFinding): string[] {
  // For no-comparison / early-data cases, % changes are meaningless — show a
  // plain volume note instead, drawn from the existing evidence numbers.
  if (f.signal === "insufficient_comparison") {
    return ["Last week had no comparable data to measure against."];
  }
  if (f.signal === "low_volume") {
    const vol = f.evidence.metrics.find((m) => kindOf(m.label) === "conversions");
    const label = vol?.label.toLowerCase().includes("results") ? "Results" : "Conversions";
    const current = vol?.current ?? String(f.snapshot.conversions);
    return [`${label}: ${current} so far — too little data to give a score yet`];
  }

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
  const action = f.guidance?.action ?? f.aiRecommendedAction ?? "Review this campaign before making changes.";
  const steps = (f.guidance?.steps ?? []).slice(0, 2);
  return { action, steps };
}

/** "2026-08-29" → "Aug 29"; range collapses the month when both dates share it. */
function fmtDay(iso: string): { month: string; day: number } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
  };
}

function fmtRange(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "—";
  const s = fmtDay(startIso);
  const e = fmtDay(endIso);
  const end = s.month === e.month ? `${e.day}` : `${e.month} ${e.day}`;
  return `${s.month} ${s.day}–${end}`;
}

export function buildBriefing(analysis: BriefingInput): string {
  const platformLabel = platformMeta(analysis.platform).label;
  // Surface anything that needs the marketer's eyes — performance problems plus
  // data-quality flags (tracking / early data) — but not stable or positive
  // signals. Findings arrive pre-sorted by priority. This is presentation only.
  const flagged = analysis.findings.filter((f) => !NON_ACTIONABLE.has(f.signal)).slice(0, 6);

  const spend = `$${analysis.totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const lines: string[] = [
    `<b>AdMate Briefing — ${escapeHtml(platformLabel)}</b>`,
    `Spend: ${spend} · ${flagged.length} ${flagged.length === 1 ? "campaign needs" : "campaigns need"} attention`,
    `Comparing ${fmtRange(analysis.currentWindow.start, analysis.currentWindow.end)} vs ${fmtRange(analysis.previousWindow.start, analysis.previousWindow.end)}.`,
  ];

  if (flagged.length === 0) {
    lines.push("", "Everything looks healthy this week — no campaigns need attention.");
    return lines.join("\n");
  }

  flagged.forEach((f) => {
    const score = f.performanceScore !== null ? ` · ${f.performanceScore}` : "";
    const { action, steps } = whatToDo(f);
    lines.push(
      "",
      "──────────",
      `${ratingEmoji(f)} <b>${escapeHtml(f.campaignName)}</b>`,
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
    );
  });

  return lines.join("\n");
}

/** Plain-text render of the same digest (Telegram preview before connecting). */
export function briefingPlainText(analysis: BriefingInput): string {
  return buildBriefing(analysis)
    .replace(/<\/?(b|i)>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
