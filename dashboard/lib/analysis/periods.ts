import { addDays, endOfMonth, fromISO, isValidISO, rangeDays, weekday, type ISODate } from "../dates";
import { rangeLabel } from "../format";

export interface Range {
  from: ISODate;
  to: ISODate;
}

// "reports" compares two uploaded reports (files) with each other; the other
// modes compare date ranges and need daily data to be precise.
export type CompareMode = "reports" | "previous" | "last_year" | "custom" | "day" | "none";

// One uploaded report that still has live data (a file fully replaced by a newer
// upload of the same dates is not listed).
export interface Report {
  importId: string;
  platform: string;
  from: ISODate;
  to: ISODate;
  fileName: string;
  granularity: "daily" | "snapshot";
  currency?: string | null;
  attribution?: string | null;
  uploadedAt?: ISODate | null; // the day the file was uploaded (recent days' conversions may still grow)
}

export interface Selection {
  b: Range; // the period being analysed
  a: Range | null; // the comparison period
  mode: CompareMode;
  // true when A and B have different lengths: volumes are compared per day.
  normalized: boolean;
  label: string;
  compareLabel: string;
  // Set in "reports" mode: the two reports being compared (A may be absent).
  reports?: { b: Report; a: Report | null };
}

export interface Coverage {
  hasData: boolean;
  hasDaily: boolean;
  minDate: ISODate | null;
  maxDate: ISODate | null;
  // Periods of snapshot (aggregate) uploads, newest first.
  snapshots: { importId: string; platform: string; from: ISODate; to: ISODate; fileName: string }[];
  // All uploaded reports with live data, newest period first.
  reports: Report[];
  // Days that have daily data (for the calendar picker hints).
  dailyFrom: ISODate | null;
  dailyTo: ISODate | null;
}

const PLATFORM_SHORT: Record<string, string> = { meta: "Meta", google: "Google Ads", tiktok: "TikTok", linkedin: "LinkedIn" };

export function reportLabel(r: Report): string {
  return `${PLATFORM_SHORT[r.platform] ?? r.platform} · ${rangeLabel(r.from, r.to)}`;
}

// Default pair: the newest report vs the previous report of the same platform
// (falling back to the next newest report of any platform).
export function defaultReports(c: Coverage): { b: Report; a: Report | null } | null {
  const b = c.reports[0];
  return b ? { b, a: previousReport(b, c.reports) } : null;
}

// The most recent report that ended before (or with) `b`, same platform first.
export function previousReport(b: Report, reports: Report[]): Report | null {
  const older = reports.filter((r) => r.importId !== b.importId && r.to <= b.to && !(r.from === b.from && r.to === b.to && r.platform === b.platform));
  return older.find((r) => r.platform === b.platform) ?? older[0] ?? null;
}

function reportSelection(b: Report, a: Report | null): Selection {
  return {
    b: { from: b.from, to: b.to },
    a: a ? { from: a.from, to: a.to } : null,
    mode: "reports",
    normalized: !!a && rangeDays(a.from, a.to) !== rangeDays(b.from, b.to),
    // Labels are used inside sentences ("… vs Aug 1–31"); the platform is only
    // added when the two reports come from different platforms.
    label: rangeLabel(b.from, b.to),
    compareLabel: a ? (a.platform !== b.platform ? `${rangeLabel(a.from, a.to)} (${PLATFORM_SHORT[a.platform] ?? a.platform})` : rangeLabel(a.from, a.to)) : "no comparison",
    reports: { b, a },
  };
}

function isFullMonth(r: Range): boolean {
  const [y, m, d] = r.from.split("-").map(Number);
  return d === 1 && r.to === endOfMonth(y, m);
}

// Immediately preceding period. Whole calendar months compare with the previous
// whole month; everything else with the same number of days right before.
// Ranges that are a multiple of 7 days are therefore weekday-aligned.
export function previousRange(b: Range): Range {
  if (isFullMonth(b)) {
    const [y, m] = b.from.split("-").map(Number);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const from = `${py}-${String(pm).padStart(2, "0")}-01`;
    return { from, to: endOfMonth(py, pm) };
  }
  const len = rangeDays(b.from, b.to);
  return { from: addDays(b.from, -len), to: addDays(b.from, -1) };
}

// Same period last year, shifted 364 days so weekdays line up
// (whole months use the same calendar month instead).
export function lastYearRange(b: Range): Range {
  if (isFullMonth(b)) {
    const [y, m] = b.from.split("-").map(Number);
    return { from: `${y - 1}-${String(m).padStart(2, "0")}-01`, to: endOfMonth(y - 1, m) };
  }
  return { from: addDays(b.from, -364), to: addDays(b.to, -364) };
}

// Default view: the last 7 days of daily data, or the newest uploaded period.
export function defaultRange(c: Coverage): Range | null {
  if (!c.hasData) return null;
  if (c.hasDaily && c.dailyTo) return { from: addDays(c.dailyTo, -6), to: c.dailyTo };
  const s = c.snapshots[0];
  return s ? { from: s.from, to: s.to } : null;
}

export interface SelectionParams {
  from?: string;
  to?: string;
  cmp?: string;
  cfrom?: string;
  cto?: string;
  report?: string; // import id of the report to analyse
  vs?: string; // import id of the report to compare with ("none" = no comparison)
}

export function resolveSelection(params: SelectionParams, c: Coverage): Selection | null {
  // Report mode: explicit report ids, or the default when there are no date params
  // and the client has no daily data (period uploads only make sense as reports).
  const byId = (id?: string) => c.reports.find((r) => r.importId === id) ?? null;
  const explicit = byId(params.report);
  if (explicit || (!params.from && !c.hasDaily && c.reports.length > 0)) {
    const b = explicit ?? c.reports[0];
    const a = params.vs === "none" ? null : params.vs ? byId(params.vs) : previousReport(b, c.reports);
    return reportSelection(b, a && a.importId !== b.importId ? a : null);
  }

  const fallback = defaultRange(c);
  let b: Range | null =
    params.from && params.to && isValidISO(params.from) && isValidISO(params.to) && params.from <= params.to
      ? { from: params.from, to: params.to }
      : fallback;
  if (!b) return null;

  const mode = (["previous", "last_year", "custom", "day", "none"].includes(params.cmp ?? "") ? params.cmp : "previous") as CompareMode;
  let a: Range | null = null;
  if (mode === "previous") a = previousRange(b);
  else if (mode === "last_year") a = lastYearRange(b);
  else if (mode === "custom" || mode === "day") {
    if (params.cfrom && isValidISO(params.cfrom)) {
      const to = params.cto && isValidISO(params.cto) && params.cto >= params.cfrom ? params.cto : params.cfrom;
      a = mode === "day" ? { from: params.cfrom, to: params.cfrom } : { from: params.cfrom, to };
    } else {
      a = mode === "day" ? { from: addDays(b.from, -7), to: addDays(b.from, -7) } : previousRange(b);
    }
    if (mode === "day") b = { from: b.from, to: b.from };
  }

  const normalized = !!a && rangeDays(a.from, a.to) !== rangeDays(b.from, b.to);
  return {
    b,
    a,
    mode,
    normalized,
    label: rangeLabel(b.from, b.to),
    compareLabel: a ? rangeLabel(a.from, a.to) : "no comparison",
  };
}

export function sameWeekdayHint(b: ISODate, a: ISODate): string | null {
  if (weekday(a) === weekday(b)) return null;
  return addDays(b, -7);
}

export interface Preset {
  label: string;
  params: SelectionParams;
}

// Presets are anchored on the latest date that has data, not on "today", so a
// client whose last upload was two weeks ago still gets meaningful defaults.
export function presets(c: Coverage): Preset[] {
  const out: Preset[] = [];
  if (c.hasDaily && c.dailyTo) {
    const end = c.dailyTo;
    const [y, m] = end.split("-").map(Number);
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    out.push(
      { label: "Last day vs day before (exploring only)", params: { from: end, to: end, cmp: "day", cfrom: addDays(end, -1) } },
      { label: "Last day vs same weekday last week (exploring only)", params: { from: end, to: end, cmp: "day", cfrom: addDays(end, -7) } },
      { label: "Last 7 days vs prior 7", params: { from: addDays(end, -6), to: end, cmp: "previous" } },
      { label: "Last 14 days vs prior 14", params: { from: addDays(end, -13), to: end, cmp: "previous" } },
      { label: "Last 30 days vs prior 30", params: { from: addDays(end, -29), to: end, cmp: "previous" } },
      { label: "Month to date vs same days last month", params: { from: monthStart, to: end, cmp: "custom", cfrom: shiftMonth(monthStart, -1), cto: shiftMonth(end, -1) } },
    );
    const prevMonthEnd = addDays(monthStart, -1);
    const [py, pm] = prevMonthEnd.split("-").map(Number);
    const prevMonthStart = `${py}-${String(pm).padStart(2, "0")}-01`;
    if (c.dailyFrom && c.dailyFrom <= prevMonthStart) {
      out.push({ label: "Last full month vs month before", params: { from: prevMonthStart, to: prevMonthEnd, cmp: "previous" } });
    }
  }
  // Uploaded reports are compared with the report picker, not with date presets.
  return out;
}

const PLATFORM_NAME = PLATFORM_SHORT;

export interface EmptyExplanation {
  message: string;
  // Periods the user can switch to with one click.
  suggestions: Preset[];
}

// Why a selected range shows no data, and what to pick instead. The common case
// is a period upload (one row per campaign for a whole month): its totals can't
// be split into single days or parts of the month without inventing numbers.
export function explainEmpty(range: Range, c: Coverage, which: "period" | "comparison"): EmptyExplanation {
  const label = rangeLabel(range.from, range.to);
  const containing = c.snapshots.filter((s) => s.from <= range.from && range.to <= s.to && !(s.from === range.from && s.to === range.to));
  const inDaily = c.hasDaily && c.dailyFrom && c.dailyTo && range.from >= c.dailyFrom && range.to <= c.dailyTo;
  const suggestions: Preset[] = [];

  let message: string;
  if (containing.length && !inDaily) {
    const s = containing[0];
    message =
      `${label} falls inside your ${PLATFORM_NAME[s.platform] ?? s.platform} upload for ${rangeLabel(s.from, s.to)}, but that file only has totals for the whole period — ` +
      `no daily breakdown. To compare single days or part of a month, re-export with a daily breakdown (Meta: Breakdown → By time → Day).`;
    suggestions.push({ label: `View ${rangeLabel(s.from, s.to)} instead`, params: { report: s.importId } });
  } else {
    const covered = [
      ...(c.hasDaily && c.dailyFrom && c.dailyTo ? [`daily data ${rangeLabel(c.dailyFrom, c.dailyTo)}`] : []),
      ...[...new Set(c.snapshots.map((s) => `${rangeLabel(s.from, s.to)} (${PLATFORM_NAME[s.platform] ?? s.platform} totals)`))],
    ];
    message = `No uploaded data covers ${which === "comparison" ? "the comparison period " : ""}${label}.${covered.length ? ` Your uploads cover: ${covered.join(", ")}.` : ""}`;
  }
  for (const s of c.snapshots) {
    if (suggestions.length >= 4) break;
    if (suggestions.some((p) => p.params.report === s.importId)) continue;
    suggestions.push({ label: `View ${PLATFORM_NAME[s.platform] ?? s.platform} ${rangeLabel(s.from, s.to)}`, params: { report: s.importId } });
  }
  if (c.hasDaily && c.dailyTo) {
    suggestions.push({ label: "Last 7 days of daily data", params: { from: addDays(c.dailyTo, -6), to: c.dailyTo, cmp: "previous" } });
  }
  return { message, suggestions };
}

function shiftMonth(iso: ISODate, delta: number): ISODate {
  const d = fromISO(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
