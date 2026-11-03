import { emptyMeasures, MEASURE_KEYS, type MeasureKey, type Measures } from "../metrics/measures";
import { objectiveFromName, type Objective } from "../metrics/objectives";
import { parseDateCell, periodFromFilename, periodFromText, type GuessedPeriod, type ISODate } from "../dates";
import { currencyFromHeaders, detectPlatform, mapColumns, type ColumnMapping, type FieldKey, type Platform } from "./headers";
import { parseNumber, readTable } from "./parse";
import { BREAKDOWN_LABEL, breakdownKind, segmentName, type BreakdownDim, type BreakdownKind } from "./breakdown";

export type Level = "campaign" | "ad_group" | "ad";
export type Granularity = "daily" | "snapshot";
export type ObjectiveSource = "result_type" | "platform_objective" | "name" | "metrics" | "default" | "user";

export interface NormalizedRow {
  campaign: string;
  campaignId: string | null;
  adGroup: string | null;
  adGroupId: string | null;
  ad: string | null;
  adId: string | null;
  date: ISODate | null; // daily rows
  periodStart: ISODate | null; // snapshot rows (from "Reporting starts/ends")
  periodEnd: ISODate | null;
  status: string | null;
  secondaryStatus: string | null;
  objective: Objective;
  objectiveSource: ObjectiveSource;
  budget: number | null;
  measures: Measures;
  // Breakdown exports only: the group this row belongs to ("Women 25–34", "Phnom Penh", …).
  segment?: string | null;
}

export interface ImportPreview {
  fileName: string;
  platform: Platform | null;
  platformScores: Record<Platform, number>;
  level: Level;
  granularity: Granularity;
  period: (GuessedPeriod & { source: "rows" | "columns" | "filename" | "title" }) | null;
  currency: string | null;
  attribution: string | null;
  mapping: { header: string; field: FieldKey | null }[];
  rows: NormalizedRow[];
  skippedRows: number;
  warnings: string[];
  // Measures the file actually contains (mapped columns, plus what "Results"
  // filled in). Anything else is missing from the export, not zero.
  measuresPresent: MeasureKey[];
  // Set when the file is a breakdown export for Audience insight (age & gender, location, …).
  breakdown: BreakdownKind | null;
}

// ---------- objective detection ----------

// Meta's "Result indicator" says exactly what `Results` counts.
function metaIndicator(ind: string): { measure: MeasureKey | null; objective: Objective | null } {
  const s = ind.toLowerCase();
  // Registrations first: the website pixel's event also contains "offsite_conversion".
  if (s.includes("complete_registration")) {
    return /mobile|app_custom_event|\bapp\b/.test(s) ? { measure: "registrations", objective: "app_registrations" } : { measure: "leads", objective: "leads" };
  }
  if (s === "reach") return { measure: "reach", objective: "awareness" };
  if (s === "impressions" || s.includes("ad_recall")) return { measure: null, objective: "awareness" };
  if (s.includes("post_engagement") || s.includes("page_engagement")) return { measure: "engagements", objective: "engagement" };
  if (s === "actions:like" || s.includes("page_like") || s.includes("follow")) return { measure: "follows", objective: "followers" };
  if (s.includes("thruplay")) return { measure: "thruplays", objective: "video_views" };
  if (s.includes("video_view")) return { measure: "videoViews", objective: "video_views" };
  if (s.includes("landing_page_view")) return { measure: "landingPageViews", objective: "website_visits" };
  if (s.includes("link_click")) return { measure: "linkClicks", objective: "traffic" };
  if (s.includes("lead")) return { measure: "leads", objective: "leads" };
  if (s.includes("messaging")) return { measure: "messages", objective: "messages" };
  if (s.includes("app_install")) return { measure: "installs", objective: "app_installs" };
  if (s.includes("purchase") || s.includes("offsite_conversion")) return { measure: "purchases", objective: "sales" };
  return { measure: null, objective: null };
}

// Platform objective / campaign-type text → objective (Meta OUTCOME_*, TikTok,
// LinkedIn "Brand awareness", Google "Video"/"Performance Max").
export function objectiveFromPlatformText(s: string, m: Measures): Objective | null {
  const t = s.toLowerCase();
  if (!t) return null;
  if (/messag/.test(t)) return "messages";
  if (/lead/.test(t)) return "leads";
  if (/app/.test(t) && /registration|sign ?up|in-?app event/.test(t)) return "app_registrations";
  if (/app/.test(t) && /install|promotion|app$/.test(t)) return "app_installs";
  // Only "landing page (views)": LinkedIn's "Website visits" objective reports
  // landing page *clicks*, which AdMate judges as Traffic (cost per click).
  if (/landing page/.test(t)) return "website_visits";
  if (/sale|conversion|purchase|catalog|shopping|performance max|website conv/.test(t)) return "sales";
  if (/video/.test(t)) return "video_views";
  if (/follow|page_likes|page likes/.test(t)) return "followers";
  if (/engag/.test(t)) return "engagement";
  if (/traffic|link_clicks|website visits/.test(t)) return "traffic";
  if (/aware|reach|brand/.test(t)) return "awareness";
  if (/display/.test(t)) return "awareness";
  if (/search|demand gen/.test(t)) return m.conversionValue > 0 ? "sales" : m.conversions > 0 ? "leads" : "traffic";
  return null;
}

export function objectiveFromMetrics(m: Measures): Objective | null {
  if (m.purchases > 0 || m.conversionValue > 0) return "sales";
  if (m.leads > 0) return "leads";
  if (m.messages > 0) return "messages";
  if (m.installs > 0) return "app_installs";
  if (m.registrations > 0) return "app_registrations";
  return null;
}

// ---------- row normalisation ----------

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

function normStatus(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  // Meta "Learning" / "Learning limited": running, but still in the learning phase.
  if (/learning/.test(t)) return "learning";
  if (/^(active|enabled|delivering|eligible|running|on)$/.test(t)) return "active";
  if (/paused|inactive|not delivering|off|stopped/.test(t)) return "paused";
  if (/complete|ended|finished/.test(t)) return "completed";
  if (/delete|removed|archived/.test(t)) return "deleted";
  return t;
}

// Delivering (including still in the learning phase). null = the export has no status.
export function isRunning(status: string | null): boolean {
  return status === null || status === "active" || status === "learning";
}

const SUMMARY_ROW = /^(total|totals|results from|summary|grand total|all campaigns)\b/i;

export function normalizeTable(buf: Buffer | Uint8Array, fileName: string, platformOverride?: Platform): ImportPreview {
  const table = readTable(buf, fileName);
  const detected = detectPlatform(table.headers);
  const platform = platformOverride ?? detected.platform;
  const warnings: string[] = [];

  if (!platform) {
    return {
      fileName, platform: null, platformScores: detected.scores, level: "campaign", granularity: "snapshot",
      period: null, currency: null, attribution: null,
      mapping: table.headers.map((h) => ({ header: h, field: null })), rows: [], skippedRows: table.rows.length, measuresPresent: [], breakdown: null,
      warnings: ["We couldn't recognise which ad platform this export came from. Choose the platform below."],
    };
  }

  const mapping = mapColumns(table.headers, platform);
  const col = (field: FieldKey) => mapping.find((c) => c.field === field)?.index ?? -1;
  const cols = (field: FieldKey) => mapping.filter((c) => c.field === field).map((c) => c.index);

  const iCampaign = col("campaign");
  if (iCampaign < 0) warnings.push("No campaign name column found — rows can't be attributed to campaigns.");
  const measureCols = new Map<MeasureKey, number[]>();
  for (const k of MEASURE_KEYS) measureCols.set(k, cols(k));
  const engagementParts = cols("engagementPart");
  const present = new Set<MeasureKey>([...measureCols].filter(([, idx]) => idx.length > 0).map(([k]) => k));
  if (engagementParts.length) present.add("engagements");
  const hasResults = col("results") >= 0;

  const hasAd = col("ad") >= 0;
  const hasAdGroup = col("adGroup") >= 0;
  const level: Level = hasAd ? "ad" : hasAdGroup ? "ad_group" : "campaign";

  const DIMS: BreakdownDim[] = ["age", "gender", "region", "placement", "publisherPlatform", "device", "hour"];
  const dims = new Set(DIMS.filter((d) => col(d) >= 0));
  const breakdown = breakdownKind(dims);

  let currency = col("currency") >= 0 ? null : currencyFromHeaders(table.headers);
  let attribution: string | null = null;

  const rows: NormalizedRow[] = [];
  let skipped = 0;
  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);

  for (const r of table.rows) {
    const campaign = cellText(get(r, iCampaign));
    const first = cellText(r[0]) ?? "";
    if (!campaign || SUMMARY_ROW.test(campaign) || SUMMARY_ROW.test(first)) {
      skipped++;
      continue;
    }

    const m = emptyMeasures();
    for (const [k, idx] of measureCols) {
      for (const i of idx) m[k] += parseNumber(r[i]) ?? 0;
    }
    if (m.engagements === 0 && engagementParts.length) {
      m.engagements = engagementParts.reduce((s, i) => s + (parseNumber(r[i]) ?? 0), 0);
    }

    // Meta: "Results" + "Result indicator" fill the measure the indicator names.
    const indicator = cellText(get(r, col("resultIndicator")));
    const results = parseNumber(get(r, col("results")));
    let objective: Objective | null = null;
    let objectiveSource: ObjectiveSource = "default";
    if (indicator) {
      const mi = metaIndicator(indicator);
      if (mi.measure && hasResults) present.add(mi.measure);
      if (mi.measure && results !== null && m[mi.measure] === 0) m[mi.measure] = results;
      if (mi.objective) {
        objective = mi.objective;
        objectiveSource = "result_type";
      }
    }
    if (!objective) {
      const po = objectiveFromPlatformText(cellText(get(r, col("objective"))) ?? "", m);
      if (po) {
        objective = po;
        objectiveSource = "platform_objective";
      }
    }
    if (!objective) {
      const byName = objectiveFromName(campaign);
      if (byName) {
        objective = byName;
        objectiveSource = "name";
      }
    }
    if (!objective) {
      const byMetrics = objectiveFromMetrics(m);
      if (byMetrics) {
        objective = byMetrics;
        objectiveSource = "metrics";
      }
    }
    // App promotion campaigns that optimise for sign-ups report registrations, not installs.
    if (objective === "app_installs" && m.installs === 0 && m.registrations > 0) {
      objective = "app_registrations";
      objectiveSource = "metrics";
    }
    // Generic results with a known objective (e.g. TikTok "Results") fill that measure.
    if (!indicator && results !== null && objective && objective !== "awareness") {
      const target: Partial<Record<Objective, MeasureKey>> = {
        leads: "leads", messages: "messages", app_installs: "installs", sales: "purchases",
        followers: "follows", video_views: "videoViews", engagement: "engagements", traffic: "linkClicks",
        app_registrations: "registrations", website_visits: "landingPageViews",
      };
      const key = target[objective];
      if (key) present.add(key);
      if (key && m[key] === 0) m[key] = results;
    }

    const rowCurrency = cellText(get(r, col("currency")));
    if (rowCurrency && !currency) currency = rowCurrency.toUpperCase();
    const attr = cellText(get(r, col("attribution")));
    if (attr && !attribution) attribution = attr;

    rows.push({
      campaign,
      campaignId: cellText(get(r, col("campaignId"))),
      adGroup: cellText(get(r, col("adGroup"))),
      adGroupId: cellText(get(r, col("adGroupId"))),
      ad: cellText(get(r, col("ad"))),
      adId: cellText(get(r, col("adId"))),
      date: parseDateCell(get(r, col("date"))),
      periodStart: parseDateCell(get(r, col("periodStart"))),
      periodEnd: parseDateCell(get(r, col("periodEnd"))),
      status: normStatus(cellText(get(r, col("status")))),
      secondaryStatus: cellText(get(r, col("secondaryStatus"))),
      objective: objective ?? "traffic",
      objectiveSource: objective ? objectiveSource : "default",
      budget: parseNumber(get(r, col("budget"))),
      measures: m,
      segment: breakdown ? (segmentName(breakdown, Object.fromEntries(DIMS.map((d) => [d, cellText(get(r, col(d)))]))) ?? "Unknown") : null,
    });
  }

  // ---------- granularity + period ----------
  const daily = rows.length > 0 && rows.every((r) => r.date);
  let period: ImportPreview["period"] = null;
  if (daily) {
    const dates = rows.map((r) => r.date!).sort();
    period = { start: dates[0], end: dates[dates.length - 1], guessed: false, source: "rows" };
  } else {
    const starts = rows.map((r) => r.periodStart).filter(Boolean) as string[];
    const ends = rows.map((r) => r.periodEnd).filter(Boolean) as string[];
    if (starts.length && ends.length) {
      period = { start: starts.sort()[0], end: ends.sort()[ends.length - 1], guessed: false, source: "columns" };
    } else {
      const fromTitle = periodFromText(table.preamble);
      const fromName = periodFromFilename(fileName);
      if (fromTitle) period = { ...fromTitle, source: "title" };
      else if (fromName) period = { ...fromName, source: "filename" };
    }
  }

  if (!daily && !breakdown) {
    warnings.push("This export has one row per campaign for the whole period (no daily breakdown). Trends, day-vs-day comparison and tracking checks need a daily export.");
  }
  if (!period) {
    warnings.push("We couldn't find the reporting period in this file. Enter the dates it covers.");
  } else if (period.guessed) {
    warnings.push(`The end date (${period.end}) was guessed from the file name. Please confirm the period.`);
  }
  if (!rows.some((r) => r.measures.spend > 0)) warnings.push("No spend found in this file.");
  const defaults = rows.filter((r) => r.objectiveSource === "default").length;
  if (defaults) warnings.push(`${defaults} campaign row(s) had no recognisable objective and were set to Traffic — review them below.`);
  if (skipped) warnings.push(`${skipped} summary/blank row(s) were skipped (totals are recomputed).`);
  if (breakdown) warnings.unshift(`This is a breakdown export (${BREAKDOWN_LABEL[breakdown]}). It feeds Audience insight and doesn’t change your campaign totals.`);
  if (breakdown && dims.size > (breakdown === "age_gender" ? (dims.has("age") && dims.has("gender") ? 2 : 1) : breakdown === "placement" ? (dims.has("placement") && dims.has("publisherPlatform") ? 2 : 1) : 1)) warnings.push("This file has more than one breakdown; AdMate uses " + BREAKDOWN_LABEL[breakdown] + ".");
  if (level !== "campaign") warnings.push(`Rows are at ${level === "ad" ? "ad" : "ad set / ad group"} level; campaign totals are rolled up from them.`);

  return {
    fileName,
    platform,
    platformScores: detected.scores,
    level,
    granularity: daily ? "daily" : "snapshot",
    period,
    currency,
    attribution,
    mapping: mapping.map((c: ColumnMapping) => ({ header: c.header, field: c.field })),
    rows,
    skippedRows: skipped,
    warnings,
    measuresPresent: MEASURE_KEYS.filter((k) => present.has(k)),
    breakdown,
  };
}
