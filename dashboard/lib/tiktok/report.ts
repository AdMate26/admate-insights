import "server-only";
import { createHash } from "node:crypto";
import { addDays, isValidISO, type ISODate } from "../dates";
import { MEASURE_KEYS, emptyMeasures, type MeasureKey } from "../metrics/measures";
import { objectiveFromName, type Objective } from "../metrics/objectives";
import { objectiveFromMetrics, objectiveFromPlatformText, type NormalizedRow, type ObjectiveSource } from "../ingest/normalize";
import { TikTokMcpError, type TikTokMcp } from "./mcp";

// Campaign-by-day performance for one advertiser, read with TikTok's read-only
// `report_integrated_get` and a fixed request (only the advertiser, the dates and
// the page vary). Dates stay in the advertiser's time zone and money stays in
// the advertiser's currency: nothing is converted.

// Every metric name below was checked live against report_integrated_get
// (read-only, 2026-10-29); one unknown name makes TikTok refuse the whole report.
// A measure AdMate cannot fill truthfully is left out, so the dashboard shows it
// as unavailable, never as zero.
export const TIKTOK_MEASURES: { measure: MeasureKey; metrics: string[]; note: string }[] = [
  { measure: "spend", metrics: ["spend"], note: "Cost in the advertiser's currency, as reported" },
  { measure: "impressions", metrics: ["impressions"], note: "Impressions" },
  // TikTok's `clicks` is "Clicks (destination)": clicks that led to the ad's
  // destination. That is AdMate's link clicks (the TikTok CSV import does the
  // same). TikTok's all-clicks total is not offered here, so "clicks (all)" stays unavailable.
  { measure: "linkClicks", metrics: ["clicks"], note: "TikTok destination clicks, stored as link clicks" },
  // Daily rows carry each day's (estimated) unique reach. AdMate never adds reach
  // up across days or campaigns (lib/metrics/availability.ts), so period reach
  // shows as unavailable instead of an inflated sum.
  { measure: "reach", metrics: ["reach"], note: "Daily reach; never added up into period reach" },
  { measure: "conversions", metrics: ["conversion"], note: "Conversions for the optimization event" },
  { measure: "purchases", metrics: ["complete_payment"], note: "Website purchases (TikTok \"Complete payment\")" },
  { measure: "installs", metrics: ["app_install"], note: "App installs" },
  { measure: "registrations", metrics: ["registration"], note: "Registrations" },
  { measure: "landingPageViews", metrics: ["total_landing_page_view"], note: "Landing page views" },
  { measure: "videoViews", metrics: ["video_play_actions"], note: "Video plays (TikTok \"Video views\")" },
  { measure: "follows", metrics: ["follows"], note: "Paid follows" },
  { measure: "engagements", metrics: ["likes", "comments", "shares"], note: "Paid likes + comments + shares" },
];

// Measures deliberately not filled from TikTok, with the reason (shown to the person).
export const TIKTOK_UNAVAILABLE: Partial<Record<MeasureKey, string>> = {
  clicksAll: "TikTok's all-clicks total isn't available through this connection",
  // video_views_p100 counts plays to 100% of the video; a ThruPlay is 15 seconds
  // or the whole video. Different meanings, so not equated.
  thruplays: "TikTok reports 100% video completions, which are not ThruPlays",
  leads: "TikTok form metrics need checking with a lead-generation advertiser first",
  messages: "TikTok messaging metrics aren't available through this connection",
  conversionValue: "TikTok's purchase value metric needs checking with a sales advertiser first",
  leadFormOpens: "Not reported by TikTok",
};

const ATTRIBUTES = ["campaign_name", "objective_type", "campaign_budget"];
export const TIKTOK_REPORT_METRICS = [...new Set([...TIKTOK_MEASURES.flatMap((m) => m.metrics), ...ATTRIBUTES])];

export const SYNC_DAYS = 30; // TikTok's limit for daily rows in one report
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const PAGE_GAP_MS = 200; // well under TikTok's per-second request limit
// A temporary failure on a page is tried again after these pauses (then the sync fails).
export const RETRY_DELAYS_MS = [1_000, 4_000];

export class TikTokReportError extends Error {
  constructor(public readonly code: "timezone" | "report" | "too_large" | "timeout", message: string) {
    super(message);
    this.name = "TikTokReportError";
  }
}

/** The last SYNC_DAYS complete days in the advertiser's time zone (today is still changing). */
export function syncWindow(timezone: string | null, now: Date): { start: ISODate; end: ISODate } {
  let today: string;
  try {
    if (!timezone) throw new Error("missing");
    today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    throw new TikTokReportError("timezone", "Unknown advertiser time zone");
  }
  if (!isValidISO(today)) throw new TikTokReportError("timezone", "Unknown advertiser time zone");
  const end = addDays(today, -1);
  return { start: addDays(end, -(SYNC_DAYS - 1)), end };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Every page of the campaign-by-day report. A temporary failure on a page is
 * retried (RETRY_DELAYS_MS); anything else, or running past `deadline`, fails the
 * whole read, and nothing is written.
 */
export async function fetchTikTokCampaignDaily(
  client: TikTokMcp,
  advertiserId: string,
  window: { start: ISODate; end: ISODate },
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  deadline: number = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
): Promise<Json[]> {
  const rows: Json[] = [];
  let totalPages = 1;
  let totalRows = 0;
  const readPage = async (page: number) => {
    for (let attempt = 0; ; attempt++) {
      if (now() > deadline) throw new TikTokReportError("timeout", "The sync took too long");
      try {
        return await readOnce(page);
      } catch (error) {
        const wait = RETRY_DELAYS_MS[attempt];
        if (!(error instanceof TikTokMcpError && error.retryable) || wait === undefined || now() + wait > deadline) throw error;
        await sleep(wait);
      }
    }
  };
  const readOnce = (page: number) =>
    client.read("report_integrated_get", {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: TIKTOK_REPORT_METRICS,
      start_date: window.start,
      end_date: window.end,
      // Deleted campaigns too, so a re-sync never drops days they already spent on.
      filtering: [{ field_name: "campaign_status", filter_type: "IN", filter_value: '["STATUS_ALL"]' }],
      page,
      page_size: PAGE_SIZE,
    });
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) await sleep(PAGE_GAP_MS);
    const data = await readPage(page);
    const info = data.page_info;
    const list = data.list;
    if (!isObject(info) || !Array.isArray(list)) throw new TikTokReportError("report", "Unexpected report format");
    const total = Number(info.total_page);
    if (!Number.isInteger(total) || total < 0) throw new TikTokReportError("report", "Unexpected report format");
    if (total > MAX_PAGES) throw new TikTokReportError("too_large", "Report too large");
    const count = Number(info.total_number ?? list.length);
    if (page === 1) [totalPages, totalRows] = [total, count];
    else if (total !== totalPages || count !== totalRows) throw new TikTokReportError("report", "The report changed while it was being read");
    for (const row of list) {
      if (!isObject(row)) throw new TikTokReportError("report", "Unexpected report format");
      rows.push(row);
    }
  }
  // Every row TikTok counted must have arrived exactly once across the pages.
  if (rows.length !== totalRows) throw new TikTokReportError("report", "The report changed while it was being read");
  return rows;
}

const CAMPAIGN_ID = /^\d{5,30}$/;

// TikTok sends numbers as strings; "-" (or nothing) means "not reported" for that row.
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface TikTokSyncData {
  rows: NormalizedRow[];
  // Measures TikTok actually reported (at least one row with a number).
  columns: MeasureKey[];
  // First and last day TikTok returned data for; null when it returned nothing.
  period: { start: ISODate; end: ISODate } | null;
  fingerprint: string;
}

/** TikTok report rows → AdMate rows. Refuses rows outside the window, unknown IDs and conflicting duplicates. */
export function normalizeTikTokReport(list: Json[], window: { start: ISODate; end: ISODate }): TikTokSyncData {
  const byKey = new Map<string, { row: NormalizedRow; raw: string }>();
  const present = new Set<MeasureKey>();
  for (const item of list) {
    const dims = isObject(item.dimensions) ? item.dimensions : null;
    const metrics = isObject(item.metrics) ? item.metrics : null;
    const campaignId = dims ? String(dims.campaign_id ?? "") : "";
    const date = dims && typeof dims.stat_time_day === "string" ? dims.stat_time_day.slice(0, 10) : "";
    if (!metrics || !CAMPAIGN_ID.test(campaignId) || !isValidISO(date)) throw new TikTokReportError("report", "Unexpected report row");
    if (date < window.start || date > window.end) throw new TikTokReportError("report", "Report row outside the requested dates");

    const m = emptyMeasures();
    for (const { measure, metrics: names } of TIKTOK_MEASURES) {
      const values = names.map((n) => num(metrics[n]));
      if (values.every((v) => v !== null)) present.add(measure);
      m[measure] = values.reduce<number>((s, v) => s + (v ?? 0), 0);
    }
    const name = typeof metrics.campaign_name === "string" && metrics.campaign_name.trim() ? metrics.campaign_name.trim().slice(0, 200) : `Campaign ${campaignId}`;
    const platformObjective = typeof metrics.objective_type === "string" ? metrics.objective_type.replace(/_/g, " ").slice(0, 60) : "";
    let objective: Objective | null = objectiveFromPlatformText(platformObjective, m);
    let objectiveSource: ObjectiveSource = "platform_objective";
    if (!objective) [objective, objectiveSource] = [objectiveFromName(name), "name"];
    if (!objective) [objective, objectiveSource] = [objectiveFromMetrics(m), "metrics"];
    // Same rule as file imports: app promotion optimised for sign-ups is judged on registrations.
    if (objective === "app_installs" && m.installs === 0 && m.registrations > 0) [objective, objectiveSource] = ["app_registrations", "metrics"];
    const budget = num(metrics.campaign_budget);

    const row: NormalizedRow = {
      campaign: name,
      campaignId,
      adGroup: null,
      adGroupId: null,
      ad: null,
      adId: null,
      date,
      periodStart: null,
      periodEnd: null,
      status: null, // campaign status needs campaign_get, which is not read-only on this server
      secondaryStatus: null,
      objective: objective ?? "traffic",
      objectiveSource: objective ? objectiveSource : "default",
      budget: budget !== null && budget > 0 ? budget : null,
      measures: m,
    };
    const key = `${campaignId}|${date}`;
    const raw = JSON.stringify(row);
    const seen = byKey.get(key);
    if (seen && seen.raw !== raw) throw new TikTokReportError("report", "TikTok returned two different rows for one campaign and day");
    byKey.set(key, { row, raw });
  }

  const rows = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v.row);
  const columns = MEASURE_KEYS.filter((k) => present.has(k));
  const dates = rows.map((r) => r.date!).sort();
  const period = dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ columns, rows: rows.map((r) => [r.campaignId, r.date, r.campaign, r.objective, r.budget, columns.map((k) => r.measures[k])]) }))
    .digest("hex");
  return { rows, columns, period, fingerprint };
}
