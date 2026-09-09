import { expect, test } from "bun:test";

import {
  computeNextRun,
  formatTime12,
  humanizeSchedule,
  isDue,
  lastDayOfMonth,
  validateSchedule,
  type Schedule,
} from "./schedule-model";

const utc = (s: string) => new Date(s);

/* -------- Formatting / humanizing -------- */
test("formatTime12 renders 12-hour clock", () => {
  expect(formatTime12("09:00")).toBe("9:00 AM");
  expect(formatTime12("16:00")).toBe("4:00 PM");
  expect(formatTime12("00:30")).toBe("12:30 AM");
  expect(formatTime12("12:05")).toBe("12:05 PM");
});

test("humanizeSchedule matches the spec summaries", () => {
  expect(humanizeSchedule({ deliveryType: "daily", time: "09:00", timezone: "UTC" })).toBe(
    "Every day at 9:00 AM",
  );
  expect(
    humanizeSchedule({ deliveryType: "weekly", time: "16:00", timezone: "UTC", weekday: 3 }),
  ).toBe("Every Wednesday at 4:00 PM");
  expect(
    humanizeSchedule({ deliveryType: "monthly", time: "15:30", timezone: "UTC", dayOfMonth: 15 }),
  ).toBe("Every 15th of the month at 3:30 PM");
  expect(
    humanizeSchedule({ deliveryType: "monthly", time: "15:30", timezone: "UTC", dayOfMonth: 31 }),
  ).toBe("Every 31st of the month at 3:30 PM");
});

/* -------- Daily -------- */
test("daily: fires today if the local time is still ahead, else tomorrow", () => {
  const s: Schedule = { deliveryType: "daily", time: "09:00", timezone: "UTC" };
  expect(computeNextRun(s, utc("2026-03-10T08:00:00Z")).toISOString()).toBe("2026-03-10T09:00:00.000Z");
  expect(computeNextRun(s, utc("2026-03-10T10:00:00Z")).toISOString()).toBe("2026-03-11T09:00:00.000Z");
});

/* -------- Weekly -------- */
test("weekly: lands on the chosen weekday at the chosen local time", () => {
  const s: Schedule = { deliveryType: "weekly", time: "16:00", timezone: "UTC", weekday: 3 };
  const next = computeNextRun(s, utc("2026-03-10T00:00:00Z")); // 2026-03-10 is a Tuesday
  expect(next.getUTCDay()).toBe(3); // Wednesday
  expect(next.getUTCHours()).toBe(16);
  expect(next.getTime()).toBeGreaterThan(utc("2026-03-10T00:00:00Z").getTime());
});

/* -------- Monthly + month-end rule -------- */
test("monthly: normal day rolls to next month once passed", () => {
  const s: Schedule = { deliveryType: "monthly", time: "12:00", timezone: "UTC", dayOfMonth: 15 };
  const next = computeNextRun(s, utc("2026-04-20T00:00:00Z"));
  expect(next.toISOString()).toBe("2026-05-15T12:00:00.000Z");
});

test("monthly month-end rule: a 31st schedule fires on the month's last valid day", () => {
  const s: Schedule = { deliveryType: "monthly", time: "12:00", timezone: "UTC", dayOfMonth: 31 };
  // February 2026 has 28 days → fire Feb 28.
  expect(computeNextRun(s, utc("2026-02-01T00:00:00Z")).toISOString()).toBe(
    "2026-02-28T12:00:00.000Z",
  );
  // April has 30 days → fire Apr 30.
  expect(computeNextRun(s, utc("2026-04-15T00:00:00Z")).toISOString()).toBe(
    "2026-04-30T12:00:00.000Z",
  );
  // A leap February (2028) → fire Feb 29.
  expect(computeNextRun(s, utc("2028-02-01T00:00:00Z")).toISOString()).toBe(
    "2028-02-29T12:00:00.000Z",
  );
});

test("lastDayOfMonth handles leap years and 30/31-day months", () => {
  expect(lastDayOfMonth(2026, 1)).toBe(28); // Feb 2026
  expect(lastDayOfMonth(2028, 1)).toBe(29); // Feb 2028 (leap)
  expect(lastDayOfMonth(2026, 3)).toBe(30); // Apr
  expect(lastDayOfMonth(2026, 0)).toBe(31); // Jan
});

/* -------- Timezone honoured -------- */
test("the fired instant reflects the schedule's timezone, not UTC", () => {
  const s: Schedule = { deliveryType: "daily", time: "09:00", timezone: "America/Los_Angeles" };
  // 9am in LA (UTC-8 in March, before DST on the 8th... 2026 DST starts Mar 8)
  // Use a date clearly in PDT (UTC-7): 2026-06-10.
  const summer: Schedule = { ...s };
  const next = computeNextRun(summer, utc("2026-06-10T00:00:00Z"));
  // 09:00 PDT == 16:00 UTC.
  expect(next.getUTCHours()).toBe(16);
});

/* -------- isDue -------- */
test("isDue only when enabled and nextSendAt has passed", () => {
  const now = utc("2026-03-10T10:00:00Z");
  expect(isDue("2026-03-10T09:00:00Z", true, now)).toBe(true);
  expect(isDue("2026-03-10T11:00:00Z", true, now)).toBe(false);
  expect(isDue("2026-03-10T09:00:00Z", false, now)).toBe(false);
  expect(isDue(null, true, now)).toBe(false);
});

/* -------- Validation -------- */
test("validateSchedule enforces the per-type required fields", () => {
  expect(validateSchedule({ deliveryType: "daily", time: "09:00" })).toBeNull();
  expect(validateSchedule({ deliveryType: "weekly", time: "16:00", weekday: 3 })).toBeNull();
  expect(validateSchedule({ deliveryType: "monthly", time: "15:30", dayOfMonth: 15 })).toBeNull();
  expect(validateSchedule({ deliveryType: "weekly", time: "16:00" })).not.toBeNull();
  expect(validateSchedule({ deliveryType: "monthly", time: "16:00" })).not.toBeNull();
  expect(validateSchedule({ deliveryType: "daily", time: "bad" })).not.toBeNull();
});
