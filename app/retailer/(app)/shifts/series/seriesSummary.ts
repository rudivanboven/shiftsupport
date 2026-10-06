import { isPast } from "@/lib/format";
import type { SeriesWithOccurrences } from "@/lib/data/series";
import type { Shift } from "@/lib/supabase/types";

/** Where each date of a series stands, for the overview and the detail page. */
export function summariseSeries(series: SeriesWithOccurrences) {
  const live = (s: Shift) => s.status !== "cancelled" && !isPast(s.end_time);
  const upcoming = series.occurrences.filter(live);

  return {
    upcoming,
    awaitingPayment: upcoming.filter((s) => s.status === "draft"),
    booked: upcoming.filter((s) => Boolean(s.accepted_by)),
    open: upcoming.filter((s) => s.status === "open" && !s.accepted_by),
    next: upcoming[0] ?? null,
  };
}

export const SERIES_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};
