/**
 * Platform pricing.
 *
 * The retailer rate is set by ShiftSupport, not by the store posting the
 * shift, so it lives here as the single source of truth. Every surface that
 * shows, or every write path that stores, a retailer shift rate reads it from
 * this module — the number is never typed into a form or taken from a request.
 */

/** What a retailer is charged, per hour, for a shift. */
export const RETAILER_HOURLY_RATE = 28;

/** What the worker earns, per hour, gross. */
export const WORKER_HOURLY_RATE = 20;

/** ShiftSupport's share of the retailer rate, per hour. */
export const PLATFORM_HOURLY_PORTION = RETAILER_HOURLY_RATE - WORKER_HOURLY_RATE;

/** Money is only ever rounded at the edges, never accumulated. */
const round2 = (value: number) => Math.round(value * 100) / 100;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * `YYYY-MM-DD` for a local Date. Built from the local parts rather than
 * `toISOString()`, which would report the previous day for anywhere east of
 * UTC and silently turn an overnight shift into a negative duration.
 */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface ShiftWindow {
  /** Hours between start and end, rounded to two decimals. Always > 0. */
  hours: number;
  /** True when the end time falls on the day after the start. */
  overnight: boolean;
  /** `YYYY-MM-DD` the shift ends on — the start date, or the day after. */
  endDate: string;
}

/**
 * Turns a date plus wall-clock start/end times into the shift's window.
 * Shared by the post-shift form and the server action so the hours the
 * retailer is quoted are the hours the server prices and stores.
 *
 * Returns null when the inputs are incomplete or don't parse.
 */
export function shiftWindow(
  date: string,
  startTime: string,
  endTime: string,
): ShiftWindow | null {
  if (!date || !startTime || !endTime) return null;

  const startMs = new Date(`${date}T${startTime}:00`).getTime();
  let endMs = new Date(`${date}T${endTime}:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  // An end time at or before the start means the shift runs past midnight.
  const overnight = endMs <= startMs;
  let endDate = date;
  if (overnight) {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    endDate = localDate(next);
    endMs = new Date(`${endDate}T${endTime}:00`).getTime();
    if (!Number.isFinite(endMs)) return null;
  }

  const hours = round2((endMs - startMs) / 3_600_000);
  if (!(hours > 0)) return null;

  return { hours, overnight, endDate };
}

export interface ShiftPricing {
  hours: number;
  /** Always `RETAILER_HOURLY_RATE`; kept on the result so callers can show it. */
  hourlyRate: number;
  /** What the retailer pays for the whole shift. */
  retailerTotal: number;
  /** Worker's gross pay for the whole shift. */
  workerGross: number;
  /** ShiftSupport's portion of the retailer total. */
  platformPortion: number;
}

/**
 * The money for a shift of `hours` hours, split the way the future payment
 * flow will need it: $28/hr charged = $20/hr worker gross + $8/hr platform.
 * Nothing here talks to a payment provider — it is the arithmetic only.
 */
export function priceShift(hours: number): ShiftPricing {
  return {
    hours,
    hourlyRate: RETAILER_HOURLY_RATE,
    retailerTotal: round2(hours * RETAILER_HOURLY_RATE),
    workerGross: round2(hours * WORKER_HOURLY_RATE),
    platformPortion: round2(hours * PLATFORM_HOURLY_PORTION),
  };
}

/** Convenience for the one number most callers want. */
export const retailerChargeFor = (hours: number) => priceShift(hours).retailerTotal;
