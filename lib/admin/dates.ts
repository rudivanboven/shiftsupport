import { REPORTING_TIME_ZONE } from "./config";

/**
 * Date ranges for the Operations Control Center.
 *
 * Two kinds of timestamp live in this database:
 *   - instants (`created_at`, `applied_at`, `paid_at`) — timestamptz;
 *   - wall-clock store times (`shifts.start_time`) — timestamp without zone.
 * A range therefore carries both: UTC instants for the first kind, and local
 * `YYYY-MM-DDT00:00:00` strings for the second.
 */

export type RangeKey = "today" | "7d" | "30d" | "custom" | "all";

export interface DateRange {
  key: RangeKey;
  label: string;
  /** Inclusive local start date, `YYYY-MM-DD`. Null for "all". */
  from: string | null;
  /** Inclusive local end date, `YYYY-MM-DD`. Null for "all". */
  to: string | null;
  /** UTC instant of `from` 00:00 local. */
  startIso: string | null;
  /** UTC instant of the day AFTER `to`, 00:00 local (exclusive). */
  endIso: string | null;
  /** Wall-clock bounds for timestamp-without-zone columns. */
  startLocal: string | null;
  endLocal: string | null;
  error?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 366;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORTING_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(instant: number) {
  const out: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(instant))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of the reporting zone from UTC at `instant`, in ms. */
function offsetMs(instant: number) {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of an instant, in the reporting zone. */
export function localDateOf(value: string | number | Date): string {
  const instant = value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime();
  const p = zonedParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC instant (ms) of local midnight at the start of `date`. */
export function localMidnightUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = offsetMs(guess);
  let instant = guess - first;
  const second = offsetMs(instant);
  if (second !== first) instant = guess - second;
  return instant;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...(from.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(to.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

export const todayLocal = () => localDateOf(Date.now());

/** `YYYY-MM-DDTHH:MM:SS` wall-clock string for a wall-clock column value. */
export const normaliseWallClock = (value: string) => value.replace(" ", "T").slice(0, 19);

/** The current wall-clock time in the reporting zone, comparable with shift times. */
export function wallClockNow(): string {
  const p = zonedParts(Date.now());
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function isRealDate(value: string | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function build(key: RangeKey, label: string, from: string, to: string, error?: string): DateRange {
  const endDate = addDays(to, 1);
  return {
    key,
    label,
    from,
    to,
    startIso: new Date(localMidnightUtc(from)).toISOString(),
    endIso: new Date(localMidnightUtc(endDate)).toISOString(),
    startLocal: `${from}T00:00:00`,
    endLocal: `${endDate}T00:00:00`,
    error,
  };
}

/**
 * Reads `?range=&from=&to=` into a validated range. Anything malformed falls
 * back to `fallback` with an explanation, rather than a query on bad input.
 */
export function parseRange(
  params: { range?: string; from?: string; to?: string },
  fallback: RangeKey = "30d",
): DateRange {
  const today = todayLocal();
  const key = (["today", "7d", "30d", "custom", "all"] as const).includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : fallback;

  switch (key) {
    case "all":
      return { key, label: "All time", from: null, to: null, startIso: null, endIso: null, startLocal: null, endLocal: null };
    case "today":
      return build(key, "Today", today, today);
    case "7d":
      return build(key, "Last 7 days", addDays(today, -6), today);
    case "custom": {
      const { from, to } = params;
      if (!isRealDate(from) || !isRealDate(to)) {
        return { ...parseRange({ range: fallback === "custom" ? "30d" : fallback }), error: "Choose a valid start and end date." };
      }
      if (to < from) {
        return { ...parseRange({ range: fallback === "custom" ? "30d" : fallback }), error: "The end date must be on or after the start date." };
      }
      if (daysBetween(from, to) + 1 > MAX_CUSTOM_DAYS) {
        return { ...parseRange({ range: fallback === "custom" ? "30d" : fallback }), error: `Custom ranges can cover at most ${MAX_CUSTOM_DAYS} days.` };
      }
      return build(key, `${from} → ${to}`, from, to);
    }
    default:
      return build("30d", "Last 30 days", addDays(today, -29), today);
  }
}

/** True when an instant falls inside the range (always true for "all"). */
export function instantInRange(value: string | null | undefined, range: DateRange) {
  if (!value) return false;
  if (!range.startIso || !range.endIso) return true;
  const t = new Date(value).getTime();
  return t >= Date.parse(range.startIso) && t < Date.parse(range.endIso);
}

/** True when a wall-clock (timestamp without zone) value falls inside the range. */
export function wallClockInRange(value: string | null | undefined, range: DateRange) {
  if (!value) return false;
  if (!range.startLocal || !range.endLocal) return true;
  const normalised = normaliseWallClock(value);
  return normalised >= range.startLocal && normalised < range.endLocal;
}

/** Local date key for a wall-clock value. */
export const wallClockDate = (value: string) => value.slice(0, 10);

export interface Bucket {
  key: string;
  label: string;
  value: number;
}

/**
 * Empty buckets covering a range: one per day up to 62 days, one per week
 * (starting on the range's first day) beyond that.
 */
export function bucketsFor(range: DateRange): { buckets: Bucket[]; keyOf: (date: string) => string | null } {
  const from = range.from ?? addDays(todayLocal(), -29);
  const to = range.to ?? todayLocal();
  const span = daysBetween(from, to) + 1;
  const weekly = span > 62;
  const step = weekly ? 7 : 1;

  const buckets: Bucket[] = [];
  for (let offset = 0; offset < span; offset += step) {
    const key = addDays(from, offset);
    buckets.push({ key, label: weekly ? `Week of ${key}` : key, value: 0 });
  }

  const keyOf = (date: string) => {
    if (date < from || date > to) return null;
    const index = Math.floor(daysBetween(from, date) / step);
    return buckets[index]?.key ?? null;
  };

  return { buckets, keyOf };
}

/** `YYYY-MM-DDTHH:MM` from a `datetime-local` input, as a wall-clock timestamp. */
export function parseLocalDateTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  if (!isRealDate(value.slice(0, 10))) return null;
  const [h, m] = value.slice(11).split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return `${value}:00`;
}
