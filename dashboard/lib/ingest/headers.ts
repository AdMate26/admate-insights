import type { MeasureKey } from "../metrics/measures";
import { BREAKDOWN_HEADERS, META_BREAKDOWN_HEADERS, type BreakdownDim } from "./breakdown";

export const PLATFORMS = ["meta", "google", "tiktok", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  meta: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

// Non-measure fields a row can carry.
export type DimensionKey =
  | "campaign"
  | "campaignId"
  | "adGroup"
  | "adGroupId"
  | "ad"
  | "adId"
  | "date" // one row = one day
  | "periodStart" // one row = an aggregated period
  | "periodEnd"
  | "status"
  | "secondaryStatus"
  | "objective" // platform objective / campaign type column
  | "resultIndicator" // Meta "Result indicator" (what `results` counts)
  | "results" // generic results; meaning depends on resultIndicator
  | "budget"
  | "currency"
  | "attribution";

export type FieldKey = MeasureKey | DimensionKey | BreakdownDim | "engagementPart";

// Header aliases, matched after normalising (lower-case, currency suffix removed,
// punctuation collapsed). Order matters only within one platform: first match wins.
// `engagementPart` headers are summed into `engagements` (TikTok splits them).
const COMMON: [string, FieldKey][] = [
  ["campaign name", "campaign"],
  ["campaign", "campaign"],
  ["campaign id", "campaignId"],
  ["ad set name", "adGroup"],
  ["ad group name", "adGroup"],
  ["ad group", "adGroup"],
  ["ad set id", "adGroupId"],
  ["ad group id", "adGroupId"],
  ["ad name", "ad"],
  ["ad id", "adId"],
  ["impressions", "impressions"],
  ["impr", "impressions"],
  ["reach", "reach"],
  ["currency", "currency"],
  ["currency code", "currency"],
];

const PLATFORM_HEADERS: Record<Platform, [string, FieldKey][]> = {
  meta: [
    ["reporting starts", "periodStart"],
    ["reporting ends", "periodEnd"],
    ["day", "date"],
    ["campaign delivery", "status"],
    ["ad set delivery", "status"],
    ["ad delivery", "status"],
    ["delivery", "status"],
    ["delivery status", "status"],
    ["result indicator", "resultIndicator"],
    ["result type", "resultIndicator"],
    ["results", "results"],
    ["amount spent", "spend"],
    ["clicks all", "clicksAll"],
    ["link clicks", "linkClicks"],
    ["landing page views", "landingPageViews"],
    ["post engagements", "engagements"],
    ["post engagement", "engagements"],
    ["facebook likes", "follows"],
    ["page likes", "follows"],
    ["instagram follows", "follows"],
    ["follows or likes", "follows"],
    ["thruplays", "thruplays"],
    ["3 second video plays", "videoViews"],
    ["video plays", "videoViews"],
    ["leads", "leads"],
    ["meta leads", "leads"],
    ["on facebook leads", "leads"],
    ["messaging conversations started", "messages"],
    ["app installs", "installs"],
    ["mobile app installs", "installs"],
    ["app registrations", "registrations"],
    ["mobile app registrations", "registrations"],
    ["app registrations completed", "registrations"],
    ["purchases", "purchases"],
    ["website purchases", "purchases"],
    ["purchases conversion value", "conversionValue"],
    ["website purchases conversion value", "conversionValue"],
    ["ad set budget", "budget"],
    ["campaign budget", "budget"],
    ["attribution setting", "attribution"],
    ["objective", "objective"],
    ["campaign objective", "objective"],
  ],
  tiktok: [
    ["date", "date"],
    ["by day", "date"],
    ["stat time day", "date"],
    ["primary status", "status"],
    ["secondary status", "secondaryStatus"],
    ["status", "status"],
    ["spend", "spend"],
    ["cost", "spend"],
    ["clicks destination", "linkClicks"],
    ["clicks all", "clicksAll"],
    ["clicks", "linkClicks"],
    ["conversions", "conversions"],
    ["results", "results"],
    ["video views", "videoViews"],
    ["video views at 100", "thruplays"],
    ["paid follows", "follows"],
    ["follows", "follows"],
    ["paid likes", "engagementPart"],
    ["paid comments", "engagementPart"],
    ["paid shares", "engagementPart"],
    ["leads", "leads"],
    ["app install", "installs"],
    ["app installs", "installs"],
    ["registration app", "registrations"],
    ["app registration", "registrations"],
    ["registrations", "registrations"],
    ["landing page view", "landingPageViews"],
    ["landing page views", "landingPageViews"],
    ["complete payment", "purchases"],
    ["purchases", "purchases"],
    ["total complete payment value", "conversionValue"],
    ["total purchase value", "conversionValue"],
    ["purchase value", "conversionValue"],
    ["objective", "objective"],
    ["advertising objective", "objective"],
    ["budget", "budget"],
  ],
  google: [
    ["day", "date"],
    ["date", "date"],
    ["campaign status", "status"],
    ["ad group status", "status"],
    ["status", "status"],
    ["cost", "spend"],
    ["clicks", "linkClicks"],
    ["interactions", "clicksAll"],
    ["conversions", "conversions"],
    ["conv", "conversions"],
    ["all conv", "conversions"],
    ["conv value", "conversionValue"],
    ["conversion value", "conversionValue"],
    ["all conv value", "conversionValue"],
    ["engagements", "engagements"],
    ["views", "videoViews"],
    ["video views", "videoViews"],
    ["campaign type", "objective"],
    ["budget", "budget"],
  ],
  linkedin: [
    ["start date in utc", "date"],
    ["start date", "date"],
    ["campaign status", "status"],
    ["status", "status"],
    ["campaign objective", "objective"],
    ["objective", "objective"],
    ["total spent", "spend"],
    ["amount spent", "spend"],
    ["clicks", "linkClicks"],
    ["total engagements", "engagements"],
    ["leads", "leads"],
    ["lead form opens", "leadFormOpens"],
    ["conversions", "conversions"],
    ["total conversion value", "conversionValue"],
    ["conversion value", "conversionValue"],
    ["follows", "follows"],
    ["video views", "videoViews"],
    ["video completions", "thruplays"],
    ["reach", "reach"],
  ],
};

// Header signatures used to guess the platform (each hit scores a point).
const SIGNATURES: Record<Platform, RegExp[]> = {
  meta: [/^amount spent/, /^result indicator$/, /^reporting starts$/, /^ad set name$/, /^cost per results?$/, /^attribution setting$/, /^facebook likes$/],
  tiktok: [/^clicks \(destination\)$/, /^ctr \(destination\)$/, /^ad group name$/, /^paid follows$/, /^net spend$/, /^primary status$/, /^secondary status$/, /^video views at 100%$/],
  google: [/^impr\.?$/, /^conv\. value$/, /^campaign type$/, /^avg\. cpc$/, /^conv\. rate$/, /^cost \/ conv\.$/, /^search impr\. share$/],
  linkedin: [/^total spent$/, /^campaign group name$/, /^lead form opens$/, /^start date \(in utc\)$/, /^campaign objective$/, /^campaign group id$/],
};

export function normaliseHeader(h: string): string {
  // Currency suffixes are upper-case ISO codes: "Amount spent (USD)". Strip them
  // before lower-casing so "(all)" in "Clicks (all)" survives.
  return h
    .replace(/\([A-Z]{3}\)/g, "")
    .toLowerCase()
    .replace(/[%().,/\-_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectPlatform(headers: string[]): { platform: Platform | null; scores: Record<Platform, number> } {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const scores = { meta: 0, tiktok: 0, google: 0, linkedin: 0 } as Record<Platform, number>;
  for (const p of PLATFORMS) {
    for (const re of SIGNATURES[p]) if (lower.some((h) => re.test(h))) scores[p]++;
  }
  const best = PLATFORMS.reduce((a, b) => (scores[b] > scores[a] ? b : a));
  return { platform: scores[best] > 0 ? best : null, scores };
}

export interface ColumnMapping {
  header: string;
  index: number;
  field: FieldKey | null;
}

// Map every header to a canonical field. Unmatched headers stay null — they are
// shown to the user as "ignored" (most are platform-computed ratios we recompute).
export function mapColumns(headers: string[], platform: Platform): ColumnMapping[] {
  const table = [...PLATFORM_HEADERS[platform], ...COMMON, ...(platform === "meta" ? META_BREAKDOWN_HEADERS : []), ...BREAKDOWN_HEADERS];
  const lookup = new Map<string, FieldKey>();
  for (const [alias, field] of table) if (!lookup.has(alias)) lookup.set(alias, field);
  const used = new Set<FieldKey>();
  return headers.map((header, index) => {
    const key = normaliseHeader(header);
    let field = lookup.get(key) ?? null;
    // Only one column may feed a single-valued field; additive helpers may repeat.
    const repeatable: FieldKey[] = ["engagementPart", "follows"];
    if (field && used.has(field) && !repeatable.includes(field)) field = null;
    if (field) used.add(field);
    return { header, index, field };
  });
}

// "Amount spent (USD)" → "USD"
export function currencyFromHeaders(headers: string[]): string | null {
  for (const h of headers) {
    const m = /\(([A-Z]{3})\)/.exec(h);
    if (m && /spent|spend|cost|budget|value/i.test(h)) return m[1];
  }
  return null;
}
