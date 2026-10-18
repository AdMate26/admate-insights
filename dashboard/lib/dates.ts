// Date helpers working on ISO "YYYY-MM-DD" strings (UTC, no time zone drift).

export type ISODate = string;

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function fromISO(s: ISODate): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((fromISO(to).getTime() - fromISO(from).getTime()) / 86_400_000);
}

// Inclusive length of a range in days.
export function rangeDays(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) + 1;
}

export function weekday(s: ISODate): number {
  return fromISO(s).getUTCDay();
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function endOfMonth(year: number, month1: number): ISODate {
  return toISO(new Date(Date.UTC(year, month1, 0)));
}

export function isValidISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISO(s).getTime()) && toISO(fromISO(s)) === s;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function mk(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISO(iso) ? iso : null;
}

// Parse a spreadsheet cell into an ISO date. Handles Date objects, Excel serial
// numbers, ISO strings, M/D/Y (D/M/Y when the first part > 12), and "Sep 1, 2026".
export function parseDateCell(v: unknown): ISODate | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // SheetJS returns local-midnight dates; shift by the offset so the calendar day is kept.
    return toISO(new Date(v.getTime() - v.getTimezoneOffset() * 60_000));
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // not an Excel date serial
    return toISO(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000));
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    return a > 12 ? mk(+m[3], b, a) : mk(+m[3], a, b);
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

export interface GuessedPeriod {
  start: ISODate;
  end: ISODate;
  // true when part of the period was inferred (e.g. end of month) and must be confirmed.
  guessed: boolean;
}

// Find a reporting period inside a file name, e.g.
//   "Cam-He-Campaigns-Mar-1-2026-Mar-31-2026.xlsx"
//   "Report_2026_08_01_to_2026_08_31.xlsx"
//   "Report_2026_08_01_to_2026_08.xlsx" (truncated → end of month, guessed)
export function periodFromFilename(name: string): GuessedPeriod | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  let m = /([A-Za-z]{3,9})[-_ ](\d{1,2})[-_ ,]+(\d{4})[-_ ]+(?:to[-_ ]+)?([A-Za-z]{3,9})[-_ ](\d{1,2})[-_ ,]+(\d{4})/.exec(base);
  if (m && MONTHS[m[1].toLowerCase()] && MONTHS[m[4].toLowerCase()]) {
    const start = mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    const end = mk(+m[6], MONTHS[m[4].toLowerCase()], +m[5]);
    if (start && end) return { start, end, guessed: false };
  }
  m = /(\d{4})[-_.](\d{2})[-_.](\d{2})[-_ ]+(?:to[-_ ]+)?(\d{4})[-_.](\d{2})[-_.](\d{2})/.exec(base);
  if (m) {
    const start = mk(+m[1], +m[2], +m[3]);
    const end = mk(+m[4], +m[5], +m[6]);
    if (start && end) return { start, end, guessed: false };
  }
  m = /(\d{4})[-_.](\d{2})[-_.](\d{2})[-_ ]+(?:to[-_ ]+)?(\d{4})[-_.](\d{2})(?!\d)/.exec(base);
  if (m) {
    const start = mk(+m[1], +m[2], +m[3]);
    if (start) return { start, end: endOfMonth(+m[4], +m[5]), guessed: true };
  }
  m = /(\d{4})[-_.](\d{2})[-_.](\d{2})/.exec(base);
  if (m) {
    const start = mk(+m[1], +m[2], +m[3]);
    if (start) return { start, end: start, guessed: true };
  }
  return null;
}

// Find a period in free text (report title rows), e.g.
//   "September 1, 2026 - September 30, 2026", "Report Start: 9/1/2026 … Report End: 9/30/2026"
export function periodFromText(lines: string[]): GuessedPeriod | null {
  const text = lines.join(" \n ");
  const datePat = String.raw`([A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})`;
  const re = new RegExp(`${datePat}\\s*(?:-|–|to|through)\\s*${datePat}`, "i");
  const m = re.exec(text);
  if (m) {
    const start = parseDateCell(m[1]);
    const end = parseDateCell(m[2]);
    if (start && end) return { start, end, guessed: false };
  }
  const s = /start[^:]*:\s*([^\n,;]+?\d{4})/i.exec(text);
  const e = /end[^:]*:\s*([^\n,;]+?\d{4})/i.exec(text);
  if (s && e) {
    const start = parseDateCell(s[1].trim());
    const end = parseDateCell(e[1].trim());
    if (start && end) return { start, end, guessed: false };
  }
  return null;
}
