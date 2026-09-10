import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isPast } from "@/lib/format";
import type {
  PublicStore,
  Shift,
  ShiftApplication,
  StoreContact,
} from "@/lib/supabase/types";

const SHIFT_COLUMNS =
  "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at";

/** `stores` has column-level privileges: contact_phone is not selectable here. */
const STORE_COLUMNS = "id,name,address";

export interface ShiftWithStore extends Shift {
  stores: PublicStore | null;
}

export interface ApplicationWithShift extends ShiftApplication {
  shifts: ShiftWithStore | null;
}

/**
 * Shifts a worker can actually apply for: still open, nobody hired yet,
 * and not already finished.
 */
export async function getAvailableShifts() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shifts")
    .select(`${SHIFT_COLUMNS},stores(${STORE_COLUMNS})`)
    .eq("status", "open")
    .is("accepted_by", null)
    .order("start_time", { ascending: true });

  const shifts = ((data ?? []) as unknown as ShiftWithStore[]).filter(
    (shift) => !isPast(shift.end_time),
  );

  return { shifts, error: error?.message ?? null };
}

/** Every application this worker has made, newest first. */
export async function getWorkerApplications(workerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shift_applications")
    .select(
      `id,shift_id,worker_id,status,applied_at,reviewed_at,rejection_reason,
       shifts(${SHIFT_COLUMNS},stores(${STORE_COLUMNS}))`,
    )
    .eq("worker_id", workerId)
    .order("applied_at", { ascending: false });

  return {
    applications: (data ?? []) as unknown as ApplicationWithShift[],
    error: error?.message ?? null,
  };
}

/**
 * Store contact details for the shifts this worker was hired for.
 *
 * `get_shift_contact` is a SECURITY DEFINER function that returns nothing
 * unless the caller is the hired worker (or store staff) — so the phone
 * number cannot be read by simply asking for another shift's id.
 */
export async function getContactsForShifts(shiftIds: string[]) {
  if (shiftIds.length === 0) return new Map<string, StoreContact>();

  const supabase = await createClient();
  const contacts = new Map<string, StoreContact>();

  const results = await Promise.all(
    shiftIds.map(async (shiftId) => {
      const { data } = await supabase.rpc("get_shift_contact", { p_shift_id: shiftId });
      return [shiftId, (data as StoreContact[] | null)?.[0] ?? null] as const;
    }),
  );

  for (const [shiftId, contact] of results) {
    if (contact) contacts.set(shiftId, contact);
  }

  return contacts;
}

export interface WorkerStats {
  available: number;
  pending: number;
  hired: number;
  completed: number;
}

export function summariseWorker(
  available: ShiftWithStore[],
  applications: ApplicationWithShift[],
): WorkerStats {
  const approved = applications.filter((a) => a.status === "approved");

  return {
    available: available.length,
    pending: applications.filter((a) => a.status === "pending").length,
    hired: approved.filter((a) => !isPast(a.shifts?.end_time)).length,
    completed: approved.filter((a) => isPast(a.shifts?.end_time)).length,
  };
}
