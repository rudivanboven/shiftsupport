import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SeriesInfo, Shift, ShiftSeries } from "@/lib/supabase/types";

/**
 * Recurring-series reads (migration 0012).
 *
 * These run as separate queries on purpose: the existing shift queries are
 * left exactly as they were, and every function here fails soft — before the
 * migration is applied it returns "no series", so every shift simply shows as
 * the one-time shift it is. All reads use the request-scoped client, so RLS
 * decides what each caller sees.
 */

const SERIES_COLUMNS =
  "id,store_id,task_type,description,shift_location,days_of_week,start_time,end_time,starts_on,ends_on,status,assigned_worker_id,assigned_at,created_by,created_at,updated_at";

const OCCURRENCE_COLUMNS =
  "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at,payment_status,amount_paid_cents,paid_at,published_at,series_id,occurrence_date";

/** Keeps `.in(...)` filters to a URL length PostgREST is happy with. */
const chunks = <T,>(items: T[], size = 100) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const normaliseSeries = <T extends Pick<ShiftSeries, "days_of_week">>(row: T): T => ({
  ...row,
  days_of_week: (row.days_of_week ?? []).map(Number),
});

/**
 * The series each of these shifts belongs to, keyed by shift id. Shifts that
 * are not part of a series (every pre-existing shift) are simply absent.
 */
export async function getSeriesForShifts(shiftIds: string[]) {
  const byShift = new Map<string, SeriesInfo>();
  const ids = [...new Set(shiftIds)];
  if (ids.length === 0) return byShift;

  const supabase = await createClient();
  const links: { id: string; series_id: string; occurrence_date: string | null }[] = [];

  for (const part of chunks(ids)) {
    const { data, error } = await supabase
      .from("shifts")
      .select("id,series_id,occurrence_date")
      .in("id", part)
      .not("series_id", "is", null);
    // Before migration 0012 the column does not exist: treat as no series.
    if (error) return byShift;
    links.push(...((data ?? []) as typeof links));
  }

  if (links.length === 0) return byShift;

  const seriesById = new Map<string, Omit<SeriesInfo, "occurrence_date">>();
  for (const part of chunks([...new Set(links.map((l) => l.series_id))])) {
    const { data, error } = await supabase
      .from("shift_series")
      .select("id,days_of_week,start_time,end_time,status,assigned_worker_id")
      .in("id", part);
    if (error) return byShift;
    for (const row of (data ?? []) as Omit<SeriesInfo, "occurrence_date">[]) {
      seriesById.set(row.id, normaliseSeries(row));
    }
  }

  for (const link of links) {
    const series = seriesById.get(link.series_id);
    if (series) byShift.set(link.id, { ...series, occurrence_date: link.occurrence_date });
  }
  return byShift;
}

export interface SeriesWithOccurrences extends ShiftSeries {
  occurrences: Shift[];
}

/** Every series this store has created, newest first, with its dates. */
export async function getStoreSeries(storeId: string): Promise<SeriesWithOccurrences[]> {
  const supabase = await createClient();

  const { data: seriesRows, error } = await supabase
    .from("shift_series")
    .select(SERIES_COLUMNS)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error || !seriesRows?.length) return [];

  const { data: shiftRows } = await supabase
    .from("shifts")
    .select(OCCURRENCE_COLUMNS)
    .eq("store_id", storeId)
    .not("series_id", "is", null)
    .order("start_time", { ascending: true });

  const bySeries = new Map<string, Shift[]>();
  for (const shift of (shiftRows ?? []) as Shift[]) {
    const list = bySeries.get(shift.series_id!) ?? [];
    list.push(shift);
    bySeries.set(shift.series_id!, list);
  }

  return (seriesRows as ShiftSeries[]).map((series) => ({
    ...normaliseSeries(series),
    occurrences: bySeries.get(series.id) ?? [],
  }));
}

/** One series of this store, with its dates in date order. */
export async function getSeriesDetail(
  seriesId: string,
  storeId: string,
): Promise<SeriesWithOccurrences | null> {
  const supabase = await createClient();

  const { data: series, error } = await supabase
    .from("shift_series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error || !series) return null;

  const { data: shiftRows } = await supabase
    .from("shifts")
    .select(OCCURRENCE_COLUMNS)
    .eq("series_id", seriesId)
    .order("start_time", { ascending: true });

  return {
    ...normaliseSeries(series as ShiftSeries),
    occurrences: (shiftRows ?? []) as Shift[],
  };
}

/**
 * Display name of a series' kept worker. A store can read the name of a
 * worker it has hired (workers_select_for_store); contact details still only
 * come through get_shift_worker_contact.
 */
export async function getWorkerName(workerId: string | null) {
  if (!workerId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("full_name")
    .eq("id", workerId)
    .maybeSingle();
  return (data as { full_name: string | null } | null)?.full_name ?? null;
}

/**
 * The marketplace shows a series once, not once per date: only its earliest
 * open date is kept, and applying to it is applying to the series. One-time
 * shifts pass through untouched, in their original order.
 */
export function collapseSeries<T extends { id: string; start_time: string }>(
  shifts: T[],
  seriesByShift: Map<string, SeriesInfo>,
) {
  const earliest = new Map<string, T>();
  const counts = new Map<string, number>();

  for (const shift of shifts) {
    const series = seriesByShift.get(shift.id);
    if (!series) continue;
    counts.set(series.id, (counts.get(series.id) ?? 0) + 1);
    const current = earliest.get(series.id);
    if (!current || shift.start_time < current.start_time) earliest.set(series.id, shift);
  }

  const kept = new Set([...earliest.values()].map((s) => s.id));
  const visible = shifts.filter((shift) => !seriesByShift.has(shift.id) || kept.has(shift.id));

  /** Open dates in the series this shift represents, itself included. */
  const openDates = (shiftId: string) => {
    const series = seriesByShift.get(shiftId);
    return series ? counts.get(series.id) ?? 1 : 1;
  };

  return { visible, openDates };
}
