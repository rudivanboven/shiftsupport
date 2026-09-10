import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isPast } from "@/lib/format";
import type {
  PublicWorker,
  Shift,
  ShiftApplication,
  WorkerContact,
} from "@/lib/supabase/types";

export interface ApplicationWithContext extends ShiftApplication {
  shifts: Shift | null;
  workers: Pick<PublicWorker, "id" | "full_name"> | null;
}

const SHIFT_COLUMNS =
  "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at";

/** Every shift belonging to the retailer's store, soonest first. */
export async function getStoreShifts(storeId: string, limit?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("shifts")
    .select(SHIFT_COLUMNS)
    .eq("store_id", storeId)
    .order("start_time", { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  return { shifts: (data ?? []) as Shift[], error: error?.message ?? null };
}

/** Applications across all of this store's shifts. */
export async function getStoreApplications(
  storeId: string,
  options: { status?: string; limit?: number } = {},
) {
  const supabase = await createClient();

  let query = supabase
    .from("shift_applications")
    .select(
      `id,shift_id,worker_id,status,applied_at,reviewed_at,rejection_reason,
       shifts!inner(${SHIFT_COLUMNS}),
       workers(id,full_name)`,
    )
    .eq("shifts.store_id", storeId)
    .order("applied_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;

  return {
    applications: (data ?? []) as unknown as ApplicationWithContext[],
    error: error?.message ?? null,
  };
}

export interface RetailerStats {
  activeShifts: number;
  openShifts: number;
  pendingApplications: number;
  filledShifts: number;
}

export function summariseShifts(
  shifts: Shift[],
  applications: ApplicationWithContext[],
): RetailerStats {
  const endsInFuture = (s: Shift) => !isPast(s.end_time);

  return {
    activeShifts: shifts.filter((s) => s.status !== "cancelled" && endsInFuture(s)).length,
    openShifts: shifts.filter((s) => s.status === "open" && !s.accepted_by).length,
    pendingApplications: applications.filter((a) => a.status === "pending").length,
    filledShifts: shifts.filter((s) => Boolean(s.accepted_by)).length,
  };
}

/** Applicant counts per shift, for the shift list and applicants page. */
export function countApplicationsByShift(applications: ApplicationWithContext[]) {
  const counts = new Map<string, { pending: number; total: number }>();
  for (const app of applications) {
    const entry = counts.get(app.shift_id) ?? { pending: 0, total: 0 };
    entry.total += 1;
    if (app.status === "pending") entry.pending += 1;
    counts.set(app.shift_id, entry);
  }
  return counts;
}

/**
 * Contact details for the workers hired onto the given shifts.
 *
 * `get_shift_worker_contact` is SECURITY DEFINER and returns nothing unless the
 * caller runs the shift's store — and only ever for the worker actually hired,
 * so applicants who are still pending stay anonymous beyond their name.
 */
export async function getHiredWorkerContacts(shiftIds: string[]) {
  if (shiftIds.length === 0) return new Map<string, WorkerContact>();

  const supabase = await createClient();
  const contacts = new Map<string, WorkerContact>();

  const results = await Promise.all(
    shiftIds.map(async (shiftId) => {
      const { data } = await supabase.rpc("get_shift_worker_contact", {
        p_shift_id: shiftId,
      });
      return [shiftId, (data as WorkerContact[] | null)?.[0] ?? null] as const;
    }),
  );

  for (const [shiftId, contact] of results) {
    if (contact) contacts.set(shiftId, contact);
  }

  return contacts;
}
