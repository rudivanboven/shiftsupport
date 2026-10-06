import "server-only";

import { cache } from "react";

import { adminDb } from "./auth";

export interface AdminSeriesLink {
  seriesId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  status: string;
  assignedWorkerId: string | null;
}

/**
 * Which shifts belong to a recurring series (migration 0012), keyed by shift
 * id. Kept out of the main snapshot on purpose: it fails soft — before the
 * migration is applied it is simply empty, with no warning banner — and the
 * snapshot's own shift query stays exactly as it was.
 */
export const loadSeriesIndex = cache(async (): Promise<Map<string, AdminSeriesLink>> => {
  const index = new Map<string, AdminSeriesLink>();
  const db = await adminDb();

  const { data: series, error } = await db
    .from("shift_series")
    .select("id,days_of_week,start_time,end_time,status,assigned_worker_id");
  if (error || !series?.length) return index;

  const byId = new Map(
    (series as {
      id: string;
      days_of_week: number[];
      start_time: string;
      end_time: string;
      status: string;
      assigned_worker_id: string | null;
    }[]).map((s) => [s.id, s]),
  );

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: linkError } = await db
      .from("shifts")
      .select("id,series_id")
      .not("series_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (linkError) return index;

    for (const row of (data ?? []) as { id: string; series_id: string }[]) {
      const s = byId.get(row.series_id);
      if (!s) continue;
      index.set(row.id, {
        seriesId: s.id,
        daysOfWeek: (s.days_of_week ?? []).map(Number),
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        assignedWorkerId: s.assigned_worker_id,
      });
    }
    if (!data || data.length < PAGE) return index;
  }
});
