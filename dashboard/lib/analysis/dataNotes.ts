import { addDays, daysBetween, rangeDays, toISO } from "../dates";
import { money, rangeLabel, shortDate } from "../format";
import { MEASURE_LABEL } from "../metrics/availability";
import { OBJECTIVE_DEFS, RESULT_MEASURES, type Objective } from "../metrics/objectives";
import type { MeasureKey } from "../metrics/measures";
import { PLATFORM_LABEL, type Platform } from "../ingest/headers";
import type { Analysis, AnalysisInput, DataNote } from "./types";

type PartialAnalysis = Omit<Analysis, "findings" | "goalStatus" | "dataNotes" | "done" | "decisions">;

// The objective's own result column (the generic `conversions` column is the fallback).
const OWN_RESULT: Partial<Record<Objective, MeasureKey>> = { leads: "leads", messages: "messages", app_installs: "installs", app_registrations: "registrations", sales: "purchases" };

// Problems with the data itself, shown as "Data notes" next to the findings.
// Each one changes how far the numbers can be trusted.
export function computeDataNotes(a: PartialAnalysis, input: AnalysisInput): DataNote[] {
  const notes: DataNote[] = [];
  const today = input.today ?? toISO(new Date());

  // A result column missing from the export (not the same as zero results).
  for (const o of a.objectives) {
    if (o.b.spend <= 0) continue;
    const def = OBJECTIVE_DEFS[o.objective];
    if (o.kpiMissing) {
      const missing = RESULT_MEASURES[o.objective].map((k) => MEASURE_LABEL[k]).join(" or ");
      notes.push({
        key: `missing:${o.objective}`, level: "warn",
        text: `Your export has no ${missing} column, so ${def.label.toLowerCase()} campaigns can't be judged. AdMate won't treat this as zero results. Re-export with the Results column to fix it.`,
      });
    }
    if (o.objective === "sales" && o.mode === "cost" && !o.availB.has("conversionValue")) {
      notes.push({
        key: "missing:revenue", level: "info",
        text: "No revenue (conversion value) column, so sales campaigns are judged by cost per purchase instead of ROAS.",
      });
    }
    // Results counted from the generic Conversions column (no values in the
    // objective's own column): it may include other conversion types.
    const own = OWN_RESULT[o.objective];
    if (own && !o.kpiMissing && o.b[own] === 0 && o.b.conversions > 0) {
      notes.push({
        key: `generic:${o.objective}`, level: "info",
        text: `${def.label}: ${def.resultLabel} are counted from the general “Conversions” column, because the ${MEASURE_LABEL[own]} column has no values. If that column also counts other actions, the ${def.kpiLabel.toLowerCase()} may be off.`,
      });
    }
    if (o.objective === "awareness" && o.mode === "cpm") {
      notes.push({
        key: "reach:cpm", level: "info",
        text: "Awareness is judged by cost per 1,000 impressions here, not cost per 1,000 people reached: reach counts unique people, so it can't be added across days or ads, or compared across periods of different length.",
      });
    }
  }

  // The most recent days may still gain conversions (attribution delay).
  const lagged = a.objectives.filter((o) => o.bMature && o.b.spend > 0 && OBJECTIVE_DEFS[o.objective].postClick);
  if (lagged.length) {
    notes.push({
      key: "immature", level: "info",
      text: `The last few days in this period were uploaded soon after they ended, so their ${lagged.map((o) => OBJECTIVE_DEFS[o.objective].resultLabel).join(" and ")} may still grow: platforms keep adding results for several days after a click. AdMate doesn't call a drop on those days alone.`,
    });
  }

  // Periods of different length or from different platforms.
  if (a.selection.a && a.hasComparisonData && a.selection.normalized) {
    notes.push({
      key: "lengths", level: "info",
      text: `The two periods have different lengths (${rangeDays(a.selection.b.from, a.selection.b.to)} vs ${rangeDays(a.selection.a.from, a.selection.a.to)} days), so spend and results are compared per day.`,
    });
  }
  const reps = a.selection.reports;
  if (reps?.a && reps.a.platform !== reps.b.platform) {
    notes.push({
      key: "platforms", level: "warn",
      text: `You're comparing a ${PLATFORM_LABEL[reps.b.platform as Platform] ?? reps.b.platform} report with a ${PLATFORM_LABEL[reps.a.platform as Platform] ?? reps.a.platform} report. Platforms count results differently, so compare the direction, not the exact numbers.`,
    });
  }

  // Currency and attribution settings of the uploads behind each period.
  const byImport = new Map(input.coverage.reports.map((r) => [r.importId, r]));
  const importsOf = (facts: AnalysisInput["factsB"]) => [...new Set(facts.map((f) => f.importId).filter(Boolean) as string[])].map((id) => byImport.get(id)).filter(Boolean);
  const inB = importsOf(input.factsB);
  const inA = importsOf(input.factsA);
  const otherCurrency = [...inB, ...inA].find((r) => r!.currency && r!.currency.toUpperCase() !== a.workspace.currency.toUpperCase());
  if (otherCurrency) {
    notes.push({
      key: "currency", level: "warn",
      text: `${otherCurrency.fileName} is in ${otherCurrency.currency}, but this account uses ${a.workspace.currency}. Amounts are not converted.`,
    });
  }
  const attr = (list: typeof inB) => [...new Set(list.map((r) => r!.attribution).filter(Boolean))].sort().join(" + ");
  if (a.hasComparisonData && attr(inB) && attr(inA) && attr(inB) !== attr(inA)) {
    notes.push({
      key: "attribution", level: "warn",
      text: `The periods use different attribution settings (${attr(inB)} vs ${attr(inA)}), so results aren't counted the same way. Part of any change in results may come from that.`,
    });
  }

  // A last day that looks incomplete (exported before the day was over).
  if (a.coverage.hasDaily && a.coverage.dailyTo === a.selection.b.to && rangeDays(a.selection.b.from, a.selection.b.to) >= 2) {
    const spendOn = new Map<string, number>();
    for (const f of input.recentDaily) spendOn.set(f.periodStart, (spendOn.get(f.periodStart) ?? 0) + f.measures.spend);
    const last = spendOn.get(a.selection.b.to) ?? 0;
    const prior = Array.from({ length: 7 }, (_, i) => spendOn.get(addDays(a.selection.b.to, -1 - i))).filter((v): v is number => v !== undefined && v > 0).sort((x, y) => x - y);
    const median = prior.length >= 3 ? prior[Math.floor(prior.length / 2)] : null;
    if (median && last < median * 0.5) {
      notes.push({
        key: "partial_day", level: "warn",
        text: `${shortDate(a.selection.b.to)} has much less spend than usual (${money(last, a.workspace.currency)} vs about ${money(median, a.workspace.currency)} a day). The export may have been made before the day ended; findings that use it may change.`,
      });
    }
  }

  // Old data.
  const end = a.coverage.maxDate;
  if (end && daysBetween(end, today) > 7) {
    notes.push({
      key: "stale", level: "info",
      text: `Your latest data ends ${shortDate(end)} (${daysBetween(end, today)} days ago). Upload a newer export to see what's happening now.`,
    });
  }

  if (a.selection.a && !a.hasComparisonData && a.totals.spendB > 0) {
    notes.push({
      key: "no_comparison", level: "info",
      text: `No data for ${rangeLabel(a.selection.a.from, a.selection.a.to)}, so AdMate can't say what changed. It judges campaigns against your targets and against each other instead.`,
    });
  }
  return notes;
}
