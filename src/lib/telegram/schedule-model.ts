/**
 * Telegram schedule model (client-safe, pure).
 *
 * ONE model shared by the UI, the persistence layer and the cron runner. No
 * server-only imports here so the browser can render summaries and the pure
 * next-run math can be unit-tested.
 *
 * A schedule stores a LOCAL wall-clock time ("HH:MM", 24h) plus an explicit IANA
 * timezone. All comparisons/execution happen in UTC: `nextSendAt` is the UTC
 * instant of the next occurrence, computed from the local time in that timezone.
 * The human summary shown to the user therefore always matches the instant the
 * briefing actually fires.
 */

export type DeliveryType = "daily" | "weekly" | "monthly";

export type Schedule = {
  deliveryType: DeliveryType;
  /** Local time of day, 24h "HH:MM". */
  time: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  /** 0=Sunday … 6=Saturday. Required for weekly. */
  weekday?: number | null;
  /** 1..31. Required for monthly; clamped to the month's last valid day. */
  dayOfMonth?: number | null;
};

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Best-effort browser timezone, falling back to the MVP default. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Parse "HH:MM" → {hour, minute}; invalid input falls back to 09:00. */
export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute };
}

/** "14:30" → "2:30 PM". */
export function formatTime12(time: string): string {
  const { hour, minute } = parseTime(time);
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Human-readable summary, e.g. "Every Wednesday at 4:00 PM". */
export function humanizeSchedule(s: Schedule): string {
  const at = `at ${formatTime12(s.time)}`;
  if (s.deliveryType === "daily") return `Every day ${at}`;
  if (s.deliveryType === "weekly") {
    const day = WEEKDAY_LABELS[s.weekday ?? 1] ?? "Monday";
    return `Every ${day} ${at}`;
  }
  return `Every ${ordinal(s.dayOfMonth ?? 1)} of the month ${at}`;
}

/* -------------------------------------------------------------------------- */
/* Timezone math (no external libraries)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Offset (ms) of `tz` from UTC at the given instant. Positive = ahead of UTC.
 * Uses Intl to read the wall-clock the instant maps to in `tz`.
 */
function tzOffsetMs(tz: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - instant.getTime();
}

/**
 * UTC instant for a wall-clock time in `tz`. DST-safe to the minute except
 * inside the ~1h transition window, which is acceptable for a briefing MVP.
 */
export function zonedTimeToUtc(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const naiveUTC = Date.UTC(year, month0, day, hour, minute, 0);
  const offset = tzOffsetMs(tz, new Date(naiveUTC));
  return new Date(naiveUTC - offset);
}

/** Local (in `tz`) calendar parts for a UTC instant. */
function zonedParts(instant: Date, tz: string): { year: number; month0: number; day: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month0: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: wdMap[parts.weekday] ?? 0,
  };
}

/** Last valid day of a month (handles Feb/leap + 30/31). */
export function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * The next UTC instant this schedule should fire, strictly AFTER `from`.
 *
 * Monthly month-end rule: if `dayOfMonth` (e.g. 29/30/31) does not exist in a
 * month, the schedule fires on that month's LAST valid day.
 */
export function computeNextRun(s: Schedule, from: Date = new Date()): Date {
  const { hour, minute } = parseTime(s.time);
  const tz = s.timezone || DEFAULT_TIMEZONE;
  const start = zonedParts(from, tz);

  // Walk forward day-by-day from the local "today" and return the first matching
  // occurrence strictly after `from`. Bounded well past a month for safety.
  const cursor = new Date(Date.UTC(start.year, start.month0, start.day, 12, 0, 0));
  for (let i = 0; i < 400; i++) {
    const p = zonedParts(cursor, tz);

    let dayToFire: number | null = null;
    if (s.deliveryType === "daily") {
      dayToFire = p.day;
    } else if (s.deliveryType === "weekly") {
      if (p.weekday === (s.weekday ?? 1)) dayToFire = p.day;
    } else {
      const last = lastDayOfMonth(p.year, p.month0);
      const target = Math.min(s.dayOfMonth ?? 1, last);
      if (p.day === target) dayToFire = target;
    }

    if (dayToFire !== null) {
      const fire = zonedTimeToUtc(p.year, p.month0, dayToFire, hour, minute, tz);
      if (fire.getTime() > from.getTime()) return fire;
    }
    // advance one local day
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  // Should never happen; fall back to 24h out.
  return new Date(from.getTime() + 86_400_000);
}

/** A schedule is due when enabled and its nextSendAt has passed. */
export function isDue(nextSendAtIso: string | null, enabled: boolean, now: Date = new Date()): boolean {
  if (!enabled || !nextSendAtIso) return false;
  const next = Date.parse(nextSendAtIso);
  return Number.isFinite(next) && next <= now.getTime();
}

/** Validate a schedule shape; returns an error string or null. */
export function validateSchedule(s: Partial<Schedule>): string | null {
  if (!s.deliveryType || !["daily", "weekly", "monthly"].includes(s.deliveryType))
    return "Choose daily, weekly or monthly.";
  if (!s.time || !/^\d{1,2}:\d{2}$/.test(s.time)) return "Enter a valid time.";
  if (s.deliveryType === "weekly" && (s.weekday == null || s.weekday < 0 || s.weekday > 6))
    return "Choose a weekday.";
  if (s.deliveryType === "monthly" && (s.dayOfMonth == null || s.dayOfMonth < 1 || s.dayOfMonth > 31))
    return "Choose a day of the month (1–31).";
  return null;
}
