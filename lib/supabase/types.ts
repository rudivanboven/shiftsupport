/**
 * Hand-maintained schema types, matching the database after
 * supabase/migrations/0001 + 0002 have been applied.
 *
 * Regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 */

export type UserRole = "worker" | "retailer" | "admin";
export type ShiftStatus = "open" | "filled" | "cancelled" | "completed";
export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string;
}

export interface Worker {
  id: string;
  memberstack_id: string | null;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  contact_phone: string | null;
  created_at: string | null;
  updated_at: string;
}

export interface StoreUser {
  id: string;
  store_id: string;
  auth_user_id: string | null;
  memberstack_id: string | null;
  email: string;
  role: string | null;
  created_at: string | null;
  updated_at: string;
}

export interface Shift {
  id: string;
  store_id: string;
  task_type: string;
  description: string | null;
  shift_location: string | null;
  start_time: string;
  end_time: string;
  duration: number;
  hourly_rate: number | null;
  status: ShiftStatus;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string;
}

export interface ShiftApplication {
  id: string;
  shift_id: string;
  worker_id: string;
  status: ApplicationStatus;
  applied_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  shift_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** The columns of `workers` a retailer may read — phone/email are absent. */
export type PublicWorker = Pick<
  Worker,
  "id" | "auth_user_id" | "memberstack_id" | "full_name" | "created_at"
>;

/** The public columns of `stores` — contact_phone is intentionally absent. */
export type PublicStore = Pick<
  Store,
  "id" | "name" | "address" | "logo_url" | "lat" | "lon"
>;

export interface WorkerContact {
  worker_name: string | null;
  phone: string | null;
  email: string | null;
}

export interface StoreContact {
  store_name: string;
  store_address: string | null;
  contact_phone: string | null;
}

/**
 * NOTE: the Supabase clients are deliberately left untyped. The generated
 * `Database` generic is regenerated from the live schema, and hand-writing it
 * drifts silently; instead every query result is cast to the interfaces above
 * at the call site, which is where the shape actually matters.
 */
