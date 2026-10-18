import type { ISODate } from "../dates";
import type { Measures } from "../metrics/measures";
import type { KpiMode, Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import type { Level } from "../ingest/normalize";
import type { Decomposition } from "./decompose";
import type { Goal, Yardstick } from "./goals";
import type { Coverage, Selection } from "./periods";
import type { Confidence } from "./stats";
import type { Avail } from "../metrics/availability";
import type { Role, RoleSource } from "./roles";

export type EntityLevel = Level; // "campaign" | "ad_group" | "ad"

export interface CampaignInfo {
  id: string;
  name: string;
  platform: Platform;
  objective: Objective;
  objectiveSource: string;
  status: string | null;
  secondaryStatus: string | null;
  budget: number | null;
  firstSeen: ISODate;
  lastSeen: ISODate;
  // Ad sets / ad groups and ads use the same shape. Absent = campaign level.
  level?: Level;
  campaignId?: string;
  parentName?: string | null; // ad set name for ads, campaign name for ad sets
  parentId?: string | null; // ad set id for ads, campaign id for ad sets
  // Funnel role chosen by the user (campaigns only). Absent/null = guessed from names.
  role?: Role | null;
}

export interface FactRow {
  importId?: string;
  campaignId: string;
  adGroupId?: string | null;
  adId?: string | null;
  platform: Platform;
  granularity: "daily" | "snapshot";
  periodStart: ISODate;
  periodEnd: ISODate;
  measures: Measures;
}

export interface AnalysisInput {
  workspace: { id: string; name: string; currency: string };
  goals: Goal[];
  campaigns: CampaignInfo[];
  // Ad sets / ad groups and ads (only present when a report was exported at that level).
  entities?: CampaignInfo[];
  coverage: Coverage;
  selection: Selection;
  factsB: FactRow[];
  factsA: FactRow[];
  // Daily facts for the 28 days up to the end of B (trend chart + tracking checks).
  recentDaily: FactRow[];
  // Everything uploaded before the period (the item's own past results).
  factsHistory?: FactRow[];
  // Measures each upload contains (by import id). Absent = assume complete.
  columns?: Map<string, Avail>;
  // "Today" for staleness checks (defaults to the real date; tests pin it).
  today?: ISODate;
  // Days before an upload whose conversions may still grow (0 = off, e.g. the
  // simulated sample, which has no attribution delay). Default MATURITY_DAYS.
  maturityDays?: number;
}

export type Verdict = "critical" | "attention" | "on_track" | "outperforming" | "watch" | "learning" | "no_data" | "idle";

export interface CampaignRow {
  info: CampaignInfo;
  level: EntityLevel;
  mode: KpiMode;
  a: Measures | null; // normalized to B's length when lengths differ
  aRaw: Measures | null;
  b: Measures;
  // What the numbers can be trusted for (missing columns, reach that can't be added up).
  availB: Avail;
  availA: Avail | null;
  kpiA: number | null;
  kpiB: number | null;
  change: number | null; // kpiB / kpiA − 1
  confidence: Confidence;
  goal: Yardstick | null;
  breakEven: number | null;
  piGoal: number | null;
  piTrend: number | null;
  piPeer: number | null;
  peerKpi: number | null; // similar items (same objective, platform, level), excluding this one
  peerCount: number; // how many similar items that average is based on
  spendShare: number; // share of its objective's spend in B
  verdict: Verdict;
  reason: string;
  learning: boolean;
  isNew: boolean; // spent in B but not in the comparison period
  isStopped: boolean; // spent in the comparison period but not in B
  // The item's own past results: all data uploaded before the period.
  history: { m: Measures; avail: Avail; from: ISODate; to: ISODate } | null;
  // Funnel role (only items with the same role are compared with each other).
  role: Role;
  roleSource: RoleSource;
  // B without the days whose conversions may still grow (null = no such days in B).
  bMature: Measures | null;
}

export interface SupportingMetric {
  key: string;
  label: string;
  unit: "currency" | "percent" | "number" | "ratio";
  polarity: "lower" | "higher" | null;
  a: number | null;
  b: number | null;
  change: number | null;
  missing: boolean; // the export doesn't contain what this metric needs
}

export interface ObjectiveSummary {
  objective: Objective;
  mode: KpiMode;
  a: Measures | null;
  aRaw: Measures | null;
  b: Measures;
  availB: Avail;
  kpiMissing: boolean; // the primary KPI can't be computed from this export
  spendShare: number;
  kpiA: number | null;
  kpiB: number | null;
  change: number | null;
  confidence: Confidence;
  goal: Yardstick | null;
  breakEven: number | null;
  piGoal: number | null;
  decomposition: Decomposition | null;
  supporting: SupportingMetric[];
  campaignCount: number;
  // Everything uploaded before the period, for this objective (for persistence checks).
  history: Measures | null;
  bMature: Measures | null;
}

export interface PlatformSummary {
  platform: Platform;
  spendA: number | null;
  spendB: number;
  share: number;
}

export type ActionType =
  | "FIX_TRACKING"
  | "PAUSE"
  | "REDUCE_BUDGET"
  | "SCALE_BUDGET"
  | "REFRESH_CREATIVE"
  | "EXPAND_AUDIENCE"
  | "CHECK_LANDING_PAGE"
  | "SHIFT_BUDGET"
  | "CHECK_DELIVERY"
  | "HOLD_BUDGET"
  | "INVESTIGATE"
  | "REUSE_WINNER"
  | "APPLY_LEARNING" // ended campaigns: reuse or avoid a setup in the next flight
  | "WATCH";

export interface Evidence {
  label: string;
  a: string | null;
  b: string;
}

// Needs attention / Opportunities / Monitor on the account home.
export type Bucket = "attention" | "opportunity" | "monitor";
export type Priority = "high" | "medium" | "low" | "monitor";
export type FindingStatus = "todo" | "in_review" | "done" | "dismissed" | "snoozed";

// One thing AdMate noticed, in the same shape everywhere (Home, Campaigns, the
// assistant, the summary). Every number in the text comes from `evidence`,
// `dataBasis`, `moneyAtStake` or `extraCost`, all computed by the engine.
export interface Finding {
  key: string; // stable: detector + entity, links the user's decisions
  detector: string;
  actionType: ActionType;
  bucket: Bucket;
  priority: Priority;
  priorityReason: string; // "Why this priority"
  rule: string; // "Flagged because …" — the threshold that fired
  confidence: Confidence;
  dataBasis: string; // "7 days · $1,240 · 48.2K impressions · 112 leads"

  objective: Objective;
  level: EntityLevel | "account";
  entityId: string | null;
  entityName: string | null;
  parentName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  platform: Platform | null;

  title: string;
  whatHappened: string;
  whyItMatters: string;
  likelyCause: string; // a hypothesis, labelled as such in the UI
  action: string;
  risk: string;
  recheckDays: number;
  recheckRule: string;
  evidence: Evidence[];
  related: string[]; // other changes in the same place (new/stopped ads, weakest ads)

  moneyAtStake: number; // actual spend of the affected item in the period
  stakeShare: number; // … as a share of all spend in the period
  extraCost: { amount: number; text: string } | null;

  status: FindingStatus;
  dismissReason: string | null;
}

// "Am I OK?" per objective: against the user's target when there is one,
// otherwise against history or the other campaigns — and it says which.
export interface GoalStatus {
  objective: Objective;
  mode: KpiMode;
  kpiLabel: string;
  value: number | null;
  basis: "target" | "break_even" | "previous" | "within_account" | "none";
  state: "on_track" | "off_track" | "far_off" | "better" | "worse" | "flat" | "unknown";
  headline: string;
  detail: string | null;
  confidence: Confidence;
  // Offered when no target is set: this period's own KPI.
  suggestedTarget: number | null;
}

// Things about the data itself that change how far the findings can be trusted.
export interface DataNote {
  key: string;
  level: "warn" | "info";
  text: string;
}

// A finding the user marked done, and whether things improved since.
export interface DoneItem {
  key: string;
  title: string;
  doneAt: ISODate;
  recheckDays: number;
  outcome: {
    state: "improved" | "worse" | "no_change" | "waiting" | "not_enough_data";
    text: string;
  };
}

export interface DailyPoint {
  date: ISODate;
  measures: Measures;
}

export interface Analysis {
  workspace: AnalysisInput["workspace"];
  selection: Selection;
  coverage: Coverage;
  totals: { spendA: number | null; spendB: number; change: number | null };
  objectives: ObjectiveSummary[];
  platforms: PlatformSummary[];
  campaigns: CampaignRow[];
  // Rows for ad sets / ad groups and ads (empty when no report has that level).
  byLevel: { ad_group: CampaignRow[]; ad: CampaignRow[] };
  findings: Finding[];
  goalStatus: GoalStatus[];
  dataNotes: DataNote[];
  // Campaigns that started or stopped between the two periods.
  changes: { started: string[]; stopped: string[] };
  // Daily totals per objective for the 28 days up to the end of the period.
  daily: { objective: Objective; points: DailyPoint[] }[];
  hasComparisonData: boolean;
  goals: Goal[];
  done: DoneItem[];
  // The user's decisions by key (findings and campaign plans): in review, done, dismissed.
  decisions: Record<string, { status: FindingStatus; dismissReason: string | null; until?: string | null }>;
}
