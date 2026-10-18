import type { MeasureKey, Measures } from "./measures";

// Campaign objectives AdMate judges performance for. Each objective has its own
// "result" and primary KPI, so an awareness campaign is never judged by CPA.
export const OBJECTIVES = [
  "awareness",
  "engagement",
  "followers",
  "video_views",
  "traffic",
  "website_visits",
  "leads",
  "messages",
  "app_installs",
  "app_registrations",
  "sales",
] as const;

export type Objective = (typeof OBJECTIVES)[number];

export type Polarity = "lower" | "higher";

export interface ObjectiveDef {
  label: string;
  resultLabel: string; // "people reached", "leads", …
  resultSingular: string;
  kpiLabel: string; // primary KPI name shown on tiles
  kpiShort: string;
  // Awareness is priced per 1,000 people reached; everything else per result.
  perThousand: boolean;
  // Conversion-type objectives: results happen after the click (CVR is meaningful).
  postClick: boolean;
}

export const OBJECTIVE_DEFS: Record<Objective, ObjectiveDef> = {
  awareness: { label: "Awareness", resultLabel: "people reached", resultSingular: "person reached", kpiLabel: "Cost per 1K reached", kpiShort: "Cost/1K reach", perThousand: true, postClick: false },
  engagement: { label: "Engagement", resultLabel: "engagements", resultSingular: "engagement", kpiLabel: "Cost per engagement", kpiShort: "CPE", perThousand: false, postClick: false },
  followers: { label: "Followers & likes", resultLabel: "follows", resultSingular: "follow", kpiLabel: "Cost per follow", kpiShort: "Cost/follow", perThousand: false, postClick: false },
  video_views: { label: "Video views", resultLabel: "video views", resultSingular: "video view", kpiLabel: "Cost per view", kpiShort: "CPV", perThousand: false, postClick: false },
  traffic: { label: "Traffic", resultLabel: "link clicks", resultSingular: "link click", kpiLabel: "Cost per link click", kpiShort: "CPC", perThousand: false, postClick: false },
  // People who actually loaded the website after the click (not just clicked).
  website_visits: { label: "Website visits", resultLabel: "landing page views", resultSingular: "landing page view", kpiLabel: "Cost per landing page view", kpiShort: "Cost/LPV", perThousand: false, postClick: true },
  leads: { label: "Lead generation", resultLabel: "leads", resultSingular: "lead", kpiLabel: "Cost per lead", kpiShort: "CPL", perThousand: false, postClick: true },
  messages: { label: "Messages", resultLabel: "conversations", resultSingular: "conversation", kpiLabel: "Cost per conversation", kpiShort: "Cost/conv.", perThousand: false, postClick: true },
  app_installs: { label: "App installs", resultLabel: "installs", resultSingular: "install", kpiLabel: "Cost per install", kpiShort: "CPI", perThousand: false, postClick: true },
  // People who completed sign-up inside the app (an in-app event after the install).
  app_registrations: { label: "App registrations", resultLabel: "registrations", resultSingular: "registration", kpiLabel: "Cost per registration", kpiShort: "Cost/reg.", perThousand: false, postClick: true },
  sales: { label: "Sales", resultLabel: "purchases", resultSingular: "purchase", kpiLabel: "Cost per purchase", kpiShort: "CPA", perThousand: false, postClick: true },
};

// The measures that can hold an objective's results (any one is enough).
export const RESULT_MEASURES: Record<Objective, MeasureKey[]> = {
  awareness: ["reach"],
  engagement: ["engagements"],
  followers: ["follows"],
  video_views: ["videoViews", "thruplays"],
  traffic: ["linkClicks"],
  website_visits: ["landingPageViews"],
  leads: ["leads", "conversions"],
  messages: ["messages", "conversions"],
  app_installs: ["installs", "conversions"],
  app_registrations: ["registrations", "conversions"],
  sales: ["purchases", "conversions"],
};

// How many "results" an objective produced. Platform-specific columns win;
// the generic `conversions` column is the fallback for conversion objectives.
export function resultCount(m: Measures, objective: Objective): number {
  switch (objective) {
    case "awareness":
      return m.reach;
    case "engagement":
      return m.engagements;
    case "followers":
      return m.follows;
    case "video_views":
      return m.videoViews || m.thruplays;
    case "traffic":
      return m.linkClicks;
    case "website_visits":
      return m.landingPageViews;
    case "app_registrations":
      return m.registrations || m.conversions;
    case "leads":
      return m.leads || m.conversions;
    case "messages":
      return m.messages || m.conversions;
    case "app_installs":
      return m.installs || m.conversions;
    case "sales":
      return m.purchases || m.conversions;
  }
}

// Sales is judged on ROAS when revenue is known, otherwise on cost per purchase.
// Awareness is judged on cost per 1K reached, or on CPM ("cpm") when reach can't
// be used: reach can't be added across days or ads, nor compared across periods
// of different length.
export type KpiMode = "cost" | "roas" | "cpm";

export function kpiMode(objective: Objective, ...ms: Measures[]): KpiMode {
  return objective === "sales" && ms.some((m) => m.conversionValue > 0) ? "roas" : "cost";
}

export function kpiLabel(objective: Objective, mode: KpiMode): string {
  return mode === "roas" ? "ROAS" : mode === "cpm" ? "Cost per 1K impressions (CPM)" : OBJECTIVE_DEFS[objective].kpiLabel;
}

export function kpiShort(objective: Objective, mode: KpiMode): string {
  return mode === "roas" ? "ROAS" : mode === "cpm" ? "CPM" : OBJECTIVE_DEFS[objective].kpiShort;
}

export function kpiPolarity(mode: KpiMode): Polarity {
  return mode === "roas" ? "higher" : "lower";
}

// Primary KPI value, or null when it can't be computed (no results / no spend).
export function kpiValue(m: Measures, objective: Objective, mode: KpiMode): number | null {
  if (mode === "roas") return m.spend > 0 ? m.conversionValue / m.spend : null;
  if (mode === "cpm") return m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null;
  const results = resultCount(m, objective);
  if (results <= 0) return null;
  const per = m.spend / results;
  return OBJECTIVE_DEFS[objective].perThousand ? per * 1000 : per;
}

// Infer an objective from a campaign name when the export has no objective
// column (TikTok) or the result type was not recognised.
const NAME_RULES: [RegExp, Objective][] = [
  [/\b(follow(er)?s?|page ?likes?|grow ?follow)/i, "followers"],
  // Before video views and leads: "landing page view" and "app sign up" would match those first.
  [/\bapp\b[^a-z0-9]*(registrations?|sign ?ups?|reg)\b|\b(registrations?|sign ?ups?)[^a-z0-9]*app\b|\bin-?app (registration|sign ?up)/i, "app_registrations"],
  [/\b(landing ?page|lpv|website visits?|site visits?)/i, "website_visits"],
  [/\b(video ?views?|vv|thru ?play|view)\b/i, "video_views"],
  [/\b(lead|form|sign ?up|registration)/i, "leads"],
  [/\b(message|messenger|inbox|conversation|chat|whatsapp)/i, "messages"],
  [/\b(app ?install|install|app promotion)/i, "app_installs"],
  [/\b(sales|purchase|conversion|catalog|shop|checkout|roas)/i, "sales"],
  [/\b(traffic|click|visit)/i, "traffic"],
  [/\b(engage(ment)?|interaction)/i, "engagement"],
  [/\b(reach|awareness|wareness|brand)/i, "awareness"],
];

export function objectiveFromName(name: string): Objective | null {
  for (const [re, obj] of NAME_RULES) if (re.test(name)) return obj;
  return null;
}
