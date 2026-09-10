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
  /**
   * Set only when the store confirms the shift happened; it starts the review
   * clock. Optional here because the shift queries do not select it — review
   * state comes from `get_shift_review_state` instead.
   */
  completed_at?: string | null;
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

/* ------------------------------------------------------------------ *
 * Reviews (migration 0005)
 * ------------------------------------------------------------------ */

export type ReviewSide = "worker" | "retailer";

export interface Review {
  id: string;
  shift_id: string;
  reviewer_user_id: string;
  reviewee_user_id: string;
  reviewer_role: ReviewSide;
  reviewee_role: ReviewSide;
  rating: number;
  comment: string | null;
  created_at: string;
}

/** One row of `get_shift_review_state` — the server's verdict for one shift. */
export interface ShiftReviewState {
  shift_id: string;
  shift_status: string;
  completed_at: string | null;
  review_opens_at: string | null;
  /** Decided by the database clock, never by the browser. */
  can_review: boolean;
  viewer_role: ReviewSide | null;
  my_rating: number | null;
  my_comment: string | null;
  my_review_created_at: string | null;
  received_rating: number | null;
}

export interface RatingSummary {
  average: number | null;
  total: number;
}

export interface WorkerReviewEntry {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  shift_id: string;
  task_type: string;
  shift_date: string;
  store_name: string;
}

export interface StoreReviewEntry {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  shift_id: string;
  task_type: string;
  shift_date: string;
  worker_name: string | null;
}
