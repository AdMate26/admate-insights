import { OBJECTIVE_DEFS, kpiShort, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import type { Measures } from "../metrics/measures";
import type { BreakdownKind } from "../ingest/breakdown";

// Audience insight: which groups (age & gender, location, placement, device, day,
// hour) bring more or fewer results than their share of the spend.

export type AudienceBreakdown = BreakdownKind | "weekday";
export const AUDIENCE_TABS: [AudienceBreakdown, string][] = [
  ["age_gender", "Age & gender"],
  ["location", "Location"],
  ["placement", "Placement"],
  ["device", "Device"],
  ["weekday", "Day of week"],
  ["hour", "Time of day"],
];

export interface Seg {
  name: string;
  spend: number;
  results: number;
}
export type Verdict = "best" | "costly" | "average" | "small";
export interface AudienceRow extends Seg {
  spendShare: number;
  resultShare: number;
  cost: number | null;
  index: number | null; // > 1 = more results than its share of spend
  z: number;
  verdict: Verdict;
}

export const audienceMode = (o: Objective): KpiMode => (o === "awareness" ? "cpm" : "cost");
export const audienceResults = (m: Measures, o: Objective) => (audienceMode(o) === "cpm" ? m.impressions : resultCount(m, o));
export const audienceResultLabel = (o: Objective) => (audienceMode(o) === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel);
export const audienceKpiShort = (o: Objective) => kpiShort(o, audienceMode(o));

// A group is only called best or costly when the difference is clear (|z| ≥ 1.96)
// and big (index ≥ 1.25 or ≤ 0.75), never on a sliver of the budget.
export function judgeSegments(segs: Seg[], mode: KpiMode, kind: AudienceBreakdown) {
  const spend = segs.reduce((s, x) => s + x.spend, 0);
  const results = segs.reduce((s, x) => s + x.results, 0);
  const avg = results > 0 ? (mode === "cpm" ? (spend / results) * 1000 : spend / results) : null;
  const rows: AudienceRow[] = segs.map((x) => {
    const spendShare = spend > 0 ? x.spend / spend : 0;
    const resultShare = results > 0 ? x.results / results : 0;
    const expected = results * spendShare;
    const z = expected > 0 ? (x.results - expected) / Math.sqrt(expected) : 0;
    const index = spendShare > 0 ? resultShare / spendShare : null;
    const cost = x.results > 0 ? (mode === "cpm" ? (x.spend / x.results) * 1000 : x.spend / x.results) : null;
    const verdict: Verdict =
      kind !== "hour" && x.results < 10 && spendShare < 0.05
        ? "small"
        : index !== null && index >= 1.25 && z >= 1.96
          ? "best"
          : index !== null && index <= 0.75 && spendShare >= 0.05 && z <= -1.96
            ? "costly"
            : "average";
    return { ...x, spendShare, resultShare, cost, index, z, verdict };
  });
  return { spend, results, avg, rows };
}

export function addSegs(into: Seg[], add: Seg[]) {
  for (const s of add) {
    const e = into.find((x) => x.name === s.name);
    if (e) {
      e.spend += s.spend;
      e.results += s.results;
    } else into.push({ ...s });
  }
  return into;
}

// What to try next for a clear winner or a costly group.
export function audienceAdvice(kind: AudienceBreakdown, name: string, verdict: "best" | "costly"): string {
  const n = name.toLowerCase();
  const T: Record<"best" | "costly", Record<AudienceBreakdown, string>> = {
    best: {
      age_gender: `Make an ad with a message and visuals for ${n} and give it its own ad set, or use the people in this group who converted to seed a lookalike audience. Try it in one ad set before moving budget.`,
      location: `Keep ${name} in every campaign; test a separate ad set with an offer or language made for it.`,
      placement: `Make creative in ${name}'s format (e.g. vertical 9:16 video for Reels) so the platform can use it more.`,
      device: `Make sure the landing page is fast and easy on ${n}; that’s where results come from.`,
      weekday: `Plan launches, offers and new creative for ${name}s, and avoid big changes the day before.`,
      hour: `Reply to messages quickly around ${name}, and schedule posts and boosts for these hours.`,
    },
    costly: {
      age_gender: `Exclude ${n} (or narrow the age range) in one ad set for a week, and compare it with the others.`,
      location: `Exclude ${name}, or lower the budget there, in one ad set first.`,
      placement: `Turn off ${name} in placements (Advantage+ placements → manual placements) and watch cost per result for a week.`,
      device: `Check the landing page and form on ${n}: slow or broken pages often cause this.`,
      weekday: `Lower spend on ${name}s only if this repeats over several weeks; weekday patterns change.`,
      hour: `Spend less at ${name}: Google Ads ad schedule can do this; Meta only allows it with a lifetime budget.`,
    },
  };
  return T[verdict][kind];
}

export const HOW_TO_EXPORT: Record<AudienceBreakdown, string[]> = {
  age_gender: ["Meta: Ads Manager → Breakdown → By delivery → Age and gender → Export table data.", "TikTok: Reporting → Custom report → dimensions Age and Gender.", "Google Ads: Insights and reports → Demographics (age, gender) → Download."],
  location: ["Meta: Breakdown → By delivery → Region (or Country / DMA region).", "TikTok: Custom report → dimension Province or City.", "Google Ads: Insights and reports → When and where ads showed → Locations."],
  placement: ["Meta: Breakdown → By delivery → Placement (with Platform).", "TikTok: Custom report → dimension Placement.", "Google Ads: Placements report (Display and Video)."],
  device: ["Meta: Breakdown → By delivery → Impression device (or Device platform).", "Google Ads: Segment → Device.", "TikTok: Custom report → dimension OS or Device."],
  weekday: ["Uses your normal daily export: nothing extra to upload."],
  hour: ["Meta: Breakdown → By time → Time of day (ad account time zone). Meta can’t combine this with age, gender or location.", "Google Ads: Insights and reports → When and where ads showed → Day and hour.", "TikTok: Custom report → dimension Hour."],
};

// ---------------------------------------------------------------------------
// Sample account only: the sample has no breakdown exports, so its splits are
// SIMULATED: deterministic profiles per campaign that add up exactly to each
// campaign's real spend and results. Always labelled as simulated on screen.
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
// [group, share of spend (weight), results per $ (relative)]
const PROFILES: Record<string, [string, number, number][]> = {
  age_gender: [
    ["Women 18–24", 16, 0.95], ["Women 25–34", 26, 1.35], ["Women 35–44", 17, 1.1], ["Women 45–54", 8, 0.8], ["Women 55+", 4, 0.55],
    ["Men 18–24", 9, 0.6], ["Men 25–34", 9, 0.7], ["Men 35–44", 6, 0.6], ["Men 45+", 5, 0.35],
  ],
  location: [["Phnom Penh", 44, 1.15], ["Siem Reap", 12, 1.05], ["Battambang", 9, 0.7], ["Kandal", 8, 1.0], ["Kampong Cham", 7, 0.85], ["Preah Sihanouk", 6, 0.6], ["Takeo", 5, 0.9], ["Other provinces", 9, 0.75]],
  placement: [["Facebook Feed", 30, 1.0], ["Instagram Feed", 18, 1.15], ["Instagram Reels", 16, 1.25], ["Facebook Reels", 10, 0.95], ["Stories", 12, 0.9], ["Messenger", 4, 0.8], ["Audience Network", 10, 0.3]],
  placement_tiktok: [["TikTok For You feed", 82, 1.05], ["Pangle (partner apps)", 18, 0.45]],
  device: [["Mobile app", 86, 1.03], ["Mobile web", 9, 0.85], ["Desktop", 5, 0.7]],
  hour: Array.from({ length: 24 }, (_, h) => [
    `${String(h).padStart(2, "0")}:00`,
    [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3, 3.5, 3.6, 4, 4.8, 4.2, 3.6, 3.5, 3.8, 4.4, 5.4, 6.6, 7.2, 6.4, 4.4, 2.2][h],
    [0.7, 0.6, 0.5, 0.5, 0.5, 0.6, 0.8, 0.9, 0.95, 1, 1, 1, 1.05, 1, 0.95, 0.95, 1, 1.05, 1.15, 1.25, 1.3, 1.2, 1, 0.8][h],
  ]) as [string, number, number][],
};

export function simulatedSplit(kind: BreakdownKind, campaignName: string, platform: string, spend: number, results: number): Seg[] {
  const profile = kind === "placement" && platform === "tiktok" ? PROFILES.placement_tiktok : PROFILES[kind];
  const r = rng(hash(`${campaignName}|${kind}`));
  const rows = profile.map(([name, w, e]) => ({ name, w: w * (0.85 + r() * 0.3), e: e * (0.9 + r() * 0.2) }));
  const sw = rows.reduce((s, x) => s + x.w, 0);
  const se = rows.reduce((s, x) => s + x.w * x.e, 0);
  const exact = rows.map((x) => (results * x.w * x.e) / se);
  const floor = exact.map(Math.floor);
  let left = Math.round(results) - floor.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((p, q) => q[0] - p[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return rows.map((x, i) => ({ name: x.name, spend: (spend * x.w) / sw, results: floor[i] }));
}
