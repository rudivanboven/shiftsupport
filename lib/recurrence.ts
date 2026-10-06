/**
 * Recurring shifts: the schedule arithmetic shared by the post-shift form, the
 * server action and every page that describes a series.
 *
 * Money is not decided here. A series is a set of ordinary shifts, and each
 * one is priced with `priceShift` from `lib/pricing` — the totals below only
 * add those per-date prices up for display.
 */

import { priceShift } from "@/lib/pricing";

/** ISO weekday numbers, 1 = Monday … 7 = Sunday — what the database stores. */
export const WEEKDAYS = [
  { iso: 1, short: "Mon", long: "Monday" },
  { iso: 2, short: "Tue", long: "Tuesday" },
  { iso: 3, short: "Wed", long: "Wednesday" },
  { iso: 4, short: "Thu", long: "Thursday" },
  { iso: 5, short: "Fri", long: "Friday" },
  { iso: 6, short: "Sat", long: "Saturday" },
  { iso: 7, short: "Sun", long: "Sunday" },
] as const;

/** How far ahead a new series schedules dates. */
export const DEFAULT_SERIES_WEEKS = 4;
export const MAX_SERIES_WEEKS = 12;

/** Keeps only valid ISO weekdays, de-duplicated and in Monday-first order. */
export function normaliseDays(values: Iterable<string | number>): number[] {
  const days = new Set<number>();
  for (const value of values) {
    const day = Number(value);
    if (Number.isInteger(day) && day >= 1 && day <= 7) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

const listJoin = (parts: string[]) =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;

/** "Every Wednesday", "Every Mon, Wed & Fri", "Every day". */
export function describeDays(days: readonly number[] | null | undefined): string {
  const sorted = normaliseDays(days ?? []);
  if (sorted.length === 0) return "Recurring";
  if (sorted.length === 7) return "Every day";

  const names = WEEKDAYS.filter((d) => sorted.includes(d.iso));
  if (names.length === 1) return `Every ${names[0].long}`;
  return `Every ${listJoin(names.map((d) => d.short))}`;
}

/** "17:00" from a Postgres `time` ("17:00:00") or an `HH:MM` form value. */
export const clockTime = (value: string | null | undefined) =>
  value ? value.slice(0, 5) : "—";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Every `YYYY-MM-DD` from `startsOn` (inclusive) for `weeks` weeks that falls
 * on one of `days`. Calendar dates are walked in UTC so a daylight-saving
 * change can never skip or repeat a day.
 */
export function occurrenceDates(startsOn: string, days: readonly number[], weeks: number): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsOn);
  if (!match || days.length === 0 || !(weeks > 0)) return [];

  const start = Date.UTC(+match[1], +match[2] - 1, +match[3]);
  if (!Number.isFinite(start)) return [];

  const wanted = new Set(days);
  const dates: string[] = [];
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const day = new Date(start + offset * 86_400_000);
    const iso = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (wanted.has(iso)) {
      dates.push(`${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`);
    }
  }
  return dates;
}

/** The last calendar day a `weeks`-long series starting on `startsOn` covers. */
export function seriesEndDate(startsOn: string, weeks: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsOn);
  if (!match || !(weeks > 0)) return null;
  const end = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]) + (weeks * 7 - 1) * 86_400_000);
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

export interface SeriesEstimate {
  occurrences: number;
  /** Retailer price of one date, from `priceShift`. */
  perOccurrence: number;
  /** Sum of the per-date prices — a displayed figure, never a charge. */
  total: number;
}

/**
 * What a run of dates adds up to at the platform rate. Each date is still
 * paid for separately through the existing per-shift checkout.
 */
export function estimateSeries(hoursPerOccurrence: number, occurrences: number): SeriesEstimate {
  const perOccurrence = priceShift(hoursPerOccurrence).retailerTotal;
  return {
    occurrences,
    perOccurrence,
    total: Math.round(perOccurrence * occurrences * 100) / 100,
  };
}
