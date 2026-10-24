import "server-only";
import { viewModel, type ViewModel } from "../analysis/viewModel";
import { alertCount, type AlertConfig, type CampaignTargets, type Rule } from "../analysis/alerts";
import type { SelectionParams } from "../analysis/periods";
import { alertState } from "./alerts";
import { loadAnalysis, loadFacts } from "./workspaces";
import { addDays } from "../dates";

// The page-ready view of one account for the selected period (the same view model
// the prototype uses), plus the account's alert settings.
export async function loadView(workspaceId: string, params: SelectionParams = {}) {
  const a = await loadAnalysis(workspaceId, params);
  if (!a) return null;
  const vm = viewModel(a, a.coverage.dailyFrom ?? a.coverage.minDate ?? a.selection.b.from);
  return { a, vm };
}

// What the browser gets: the full view, except the detail behind every ad set and ad,
// which is the bulk on big accounts. Those load when opened (/api/v5/detail).
// Details already decided on stay, for "Done & reminders".
export function forBrowser(vm: ViewModel): ViewModel {
  const details = Object.fromEntries(Object.entries(vm.details).filter(([, d]) => d.entity?.level === "campaign" || (d.status !== "todo" && d.status !== "in_review")));
  return { ...vm, details };
}

// Menu badges: decisions waiting (open High / Medium problems and opportunities whose
// check is switched on) and alerts now (Advanced).
export function badges(vm: ViewModel, st: { config: AlertConfig; rules: Rule[]; targets: CampaignTargets }) {
  const muted = new Set(st.config.muted);
  const open = (s: string) => s === "todo" || s === "in_review";
  const actions = [...vm.problems, ...vm.opportunities].filter((d) => open(d.status) && !muted.has(d.detector) && (d.priority === "high" || d.priority === "medium")).length;
  return { actions, alerts: alertCount(vm, st.config, st.rules, st.targets) };
}

export async function loadBadges(workspaceId: string, params: SelectionParams) {
  const [v, st] = await Promise.all([loadView(workspaceId, params), alertState(workspaceId)]);
  return v ? badges(v.vm, st) : { actions: 0, alerts: 0 };
}

// Daily spend of every campaign over the 4 weeks ending on the period's last day (or
// the whole period when longer): Budget's stacked chart.
export async function campaignDailySpend(workspaceId: string, from: string, to: string) {
  const start = from < addDays(to, -27) ? from : addDays(to, -27);
  const facts = (await loadFacts(workspaceId, start, to)).filter((f) => f.granularity === "daily");
  const dates: string[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) dates.push(d);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const by: Record<string, number[]> = {};
  for (const f of facts) {
    const i = idx.get(f.periodStart);
    if (i === undefined) continue;
    (by[f.campaignId] ??= dates.map(() => 0))[i] += f.measures.spend;
  }
  return { dates, by };
}

// "?from=…&to=…" from a page's searchParams, as the engine reads it.
export function selection(sp: Record<string, string | string[] | undefined>): SelectionParams {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  return { from: one("from"), to: one("to"), cmp: one("cmp"), cfrom: one("cfrom"), cto: one("cto"), report: one("report"), vs: one("vs") };
}
