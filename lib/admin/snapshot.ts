import "server-only";

import { cache } from "react";

import { adminDb } from "./auth";
import { normaliseWallClock, wallClockNow } from "./dates";
import { grantsAccess } from "@/lib/membership";
import type {
  ApplicationStatus,
  MembershipStatus,
  ShiftPaymentStatus,
  ShiftStatus,
  UserRole,
} from "@/lib/supabase/types";

/**
 * One consistent, read-only view of the operational tables for a single
 * request. Every Super Admin page derives its numbers from this, so the
 * dashboard, the directories and the finance screens can never disagree.
 *
 * Only the columns the console actually shows are selected. Stripe secrets
 * are never in the database; Stripe *identifiers* (customer, subscription,
 * checkout session, payment intent) are, and are shown as references only.
 *
 * Reads page through PostgREST's 1,000-row limit. That is comfortable for
 * this platform's size today; if tables grow into the hundreds of thousands,
 * move the aggregations into SQL functions.
 */

export interface AdminWorker {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  auth_user_id: string | null;
  membership_status: MembershipStatus | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  membership_cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface AdminProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string | null;
}

export interface AdminStore {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  created_at: string | null;
}

export interface AdminStoreUser {
  id: string;
  store_id: string;
  auth_user_id: string | null;
  email: string | null;
  role: string | null;
  created_at: string | null;
}

export interface AdminShift {
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
  created_at: string | null;
  completed_at: string | null;
  payment_status: ShiftPaymentStatus;
  amount_paid_cents: number | null;
  paid_at: string | null;
  published_at: string | null;
}

export interface AdminApplication {
  id: string;
  shift_id: string;
  worker_id: string;
  status: ApplicationStatus;
  applied_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface AdminPayment {
  id: string;
  shift_id: string;
  store_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "canceled";
  hours: number | null;
  hourly_rate: number | null;
  worker_gross_cents: number | null;
  platform_portion_cents: number | null;
  paid_at: string | null;
  created_at: string;
}

export interface AdminReview {
  id: string;
  shift_id: string;
  reviewer_role: "worker" | "retailer";
  reviewee_role: "worker" | "retailer";
  reviewee_user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export type ApprovalStatus = "submitted" | "approved" | "rejected";
export type PayrollStatus = "not_ready" | "ready" | "exported" | "submitted" | "processed" | "error";

export interface AdminTimeEntry {
  id: string;
  shift_id: string;
  worker_id: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  break_minutes: number;
  reported_hours: number | null;
  hours_source: "retailer" | "admin";
  submitted_at: string | null;
  submission_note: string | null;
  approval_status: ApprovalStatus;
  approved_hours: number | null;
  approved_at: string | null;
  approval_note: string | null;
  worker_hourly_rate: number;
  payroll_status: PayrollStatus;
  payroll_provider: string | null;
  payroll_batch_id: string | null;
  payroll_exported_at: string | null;
  payroll_submitted_at: string | null;
  payroll_processed_at: string | null;
  payroll_external_ref: string | null;
  payroll_error: string | null;
}

export interface AdminShiftAccept {
  shift_id: string;
  worker_id: string;
  accepted_at: string | null;
}

export interface Snapshot {
  workers: AdminWorker[];
  profiles: AdminProfile[];
  stores: AdminStore[];
  storeUsers: AdminStoreUser[];
  shifts: AdminShift[];
  applications: AdminApplication[];
  payments: AdminPayment[];
  reviews: AdminReview[];
  timeEntries: AdminTimeEntry[];
  payrollIds: { worker_id: string; provider: string; external_employee_id: string }[];
  accepts: AdminShiftAccept[];
  /** Tables that could not be read (e.g. migration 0010 not yet applied). */
  warnings: string[];

  workerById: Map<string, AdminWorker>;
  profileById: Map<string, AdminProfile>;
  storeById: Map<string, AdminStore>;
  shiftById: Map<string, AdminShift>;
  paymentByShift: Map<string, AdminPayment>;
  entryByShift: Map<string, AdminTimeEntry>;
  applicationsByShift: Map<string, AdminApplication[]>;
  applicationsByWorker: Map<string, AdminApplication[]>;
  shiftsByStore: Map<string, AdminShift[]>;
  shiftsByWorker: Map<string, AdminShift[]>;
  ownerByStore: Map<string, AdminStoreUser>;
}

type Db = Awaited<ReturnType<typeof adminDb>>;

const PAGE = 1000;

async function readAll<T>(db: Db, table: string, columns: string, order: string, warnings: string[], tiebreak = "id"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      // A unique tiebreak keeps pages stable when timestamps collide.
      .order(tiebreak, { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`[super-admin] Could not read ${table}:`, error.message);
      warnings.push(table);
      return rows;
    }
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const group = <T, K>(items: T[], key: (item: T) => K | null | undefined) => {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null || k === undefined) continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
};

export const loadSnapshot = cache(async (): Promise<Snapshot> => {
  const db = await adminDb();
  const warnings: string[] = [];

  const [workers, profiles, stores, storeUsers, shifts, applications, payments, reviews, timeEntries, payrollIds, accepts] =
    await Promise.all([
      readAll<AdminWorker>(db, "workers",
        "id,full_name,email,phone,created_at,auth_user_id,membership_status,membership_started_at,membership_expires_at,membership_cancel_at_period_end,stripe_customer_id,stripe_subscription_id",
        "created_at", warnings),
      readAll<AdminProfile>(db, "profiles", "id,full_name,email,phone,role,created_at", "created_at", warnings),
      readAll<AdminStore>(db, "stores", "id,name,address,contact_phone,created_at", "created_at", warnings),
      readAll<AdminStoreUser>(db, "store_users", "id,store_id,auth_user_id,email,role,created_at", "created_at", warnings),
      readAll<AdminShift>(db, "shifts",
        "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at,completed_at,payment_status,amount_paid_cents,paid_at,published_at",
        "created_at", warnings),
      readAll<AdminApplication>(db, "shift_applications", "id,shift_id,worker_id,status,applied_at,reviewed_at,rejection_reason", "applied_at", warnings),
      readAll<AdminPayment>(db, "shift_payments",
        "id,shift_id,store_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_cents,currency,status,hours,hourly_rate,worker_gross_cents,platform_portion_cents,paid_at,created_at",
        "created_at", warnings),
      readAll<AdminReview>(db, "reviews", "id,shift_id,reviewer_role,reviewee_role,reviewee_user_id,rating,comment,created_at", "created_at", warnings),
      readAll<AdminTimeEntry>(db, "shift_time_entries",
        "id,shift_id,worker_id,actual_start_time,actual_end_time,break_minutes,reported_hours,hours_source,submitted_at,submission_note,approval_status,approved_hours,approved_at,approval_note,worker_hourly_rate,payroll_status,payroll_provider,payroll_batch_id,payroll_exported_at,payroll_submitted_at,payroll_processed_at,payroll_external_ref,payroll_error",
        "created_at", warnings),
      readAll<{ worker_id: string; provider: string; external_employee_id: string }>(db, "worker_payroll_identities", "worker_id,provider,external_employee_id", "worker_id", warnings, "provider"),
      readAll<AdminShiftAccept>(db, "shift_accepts", "shift_id,worker_id,accepted_at", "accepted_at", warnings),
    ]);

  // numeric columns come back as strings from PostgREST in some setups
  for (const s of shifts) s.duration = Number(s.duration) || 0;
  for (const e of timeEntries) {
    e.reported_hours = e.reported_hours === null ? null : Number(e.reported_hours);
    e.approved_hours = e.approved_hours === null ? null : Number(e.approved_hours);
    e.worker_hourly_rate = Number(e.worker_hourly_rate);
  }
  for (const p of payments) {
    p.hours = p.hours === null ? null : Number(p.hours);
    p.hourly_rate = p.hourly_rate === null ? null : Number(p.hourly_rate);
  }

  const ownerByStore = new Map<string, AdminStoreUser>();
  for (const su of [...storeUsers].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0))) {
    if (!ownerByStore.has(su.store_id)) ownerByStore.set(su.store_id, su);
  }

  return {
    workers, profiles, stores, storeUsers, shifts, applications, payments, reviews, timeEntries, payrollIds, accepts, warnings,
    workerById: new Map(workers.map((w) => [w.id, w])),
    profileById: new Map(profiles.map((p) => [p.id, p])),
    storeById: new Map(stores.map((s) => [s.id, s])),
    shiftById: new Map(shifts.map((s) => [s.id, s])),
    paymentByShift: new Map(payments.map((p) => [p.shift_id, p])),
    entryByShift: new Map(timeEntries.map((e) => [e.shift_id, e])),
    applicationsByShift: group(applications, (a) => a.shift_id),
    applicationsByWorker: group(applications, (a) => a.worker_id),
    shiftsByStore: group(shifts, (s) => s.store_id),
    shiftsByWorker: group(shifts, (s) => s.accepted_by),
    ownerByStore,
  };
});

/* ------------------------------------------------------------------ *
 * Shared derivations
 * ------------------------------------------------------------------ */

export type MembershipView =
  | "paid_active"
  | "complimentary"
  | "past_due"
  | "canceled"
  | "expired"
  | "inactive";

/**
 * What a worker's membership actually means, from the stored Stripe state.
 * `complimentary` = access without a Stripe subscription (the workers kept on
 * by migration 0008) — active, but not a paid membership.
 */
export function membershipView(w: AdminWorker): MembershipView {
  const status = w.membership_status ?? "inactive";
  const access = grantsAccess(status, w.membership_expires_at);
  if (status === "past_due") return access ? "past_due" : "expired";
  if (status === "active") {
    if (!access) return "expired";
    return w.stripe_subscription_id ? "paid_active" : "complimentary";
  }
  if (status === "canceled") return "canceled";
  return "inactive";
}

export const membershipGrantsAccess = (w: AdminWorker) =>
  grantsAccess(w.membership_status ?? "inactive", w.membership_expires_at);

export const workerContact = (s: Snapshot, w: AdminWorker) => {
  const profile = w.auth_user_id ? s.profileById.get(w.auth_user_id) : undefined;
  return {
    name: w.full_name ?? profile?.full_name ?? null,
    email: w.email ?? profile?.email ?? null,
    phone: w.phone ?? profile?.phone ?? null,
  };
};

export const retailerContact = (s: Snapshot, storeId: string) => {
  const owner = s.ownerByStore.get(storeId);
  const profile = owner?.auth_user_id ? s.profileById.get(owner.auth_user_id) : undefined;
  return {
    owner,
    name: profile?.full_name ?? null,
    email: owner?.email ?? profile?.email ?? null,
    phone: profile?.phone ?? null,
    accountCreatedAt: owner?.created_at ?? profile?.created_at ?? null,
  };
};

/** Worker's rating from retailer reviews (the same rule as `worker_rating`). */
export function workerRating(s: Snapshot, w: AdminWorker) {
  if (!w.auth_user_id) return { average: null as number | null, total: 0, reviews: [] as AdminReview[] };
  const reviews = s.reviews.filter((r) => r.reviewer_role === "retailer" && r.reviewee_user_id === w.auth_user_id);
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
  return { average, total: reviews.length, reviews };
}

/** Store's rating from worker reviews (the same rule as `store_rating`). */
export function storeRating(s: Snapshot, storeId: string) {
  const shiftIds = new Set((s.shiftsByStore.get(storeId) ?? []).map((sh) => sh.id));
  const reviews = s.reviews.filter((r) => r.reviewer_role === "worker" && shiftIds.has(r.shift_id));
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
  return { average, total: reviews.length, reviews };
}

/** Open to applications in the marketplace right now (the shifts_select rule). */
export const isOpenShift = (sh: AdminShift) =>
  sh.status === "open" && !sh.accepted_by && (sh.payment_status === "paid" || sh.payment_status === "legacy");

export const isHired = (sh: AdminShift) => Boolean(sh.accepted_by) && sh.status !== "cancelled";

/** Admin-facing payroll stage for a hired shift. */
export type PayrollStage =
  | "scheduled"
  | "awaiting_completion"
  | "awaiting_hours"
  | "awaiting_approval"
  | "hours_rejected"
  | "ready"
  | "exported"
  | "submitted"
  | "processed"
  | "error";

export function payrollStage(sh: AdminShift, entry: AdminTimeEntry | undefined, nowLocal = wallClockNow()): PayrollStage {
  if (entry) {
    if (entry.approval_status === "submitted") return "awaiting_approval";
    if (entry.approval_status === "rejected") return "hours_rejected";
    if (entry.payroll_status === "not_ready") return "awaiting_approval";
    return entry.payroll_status;
  }
  if (sh.status === "completed") return "awaiting_hours";
  // start_time is a store wall-clock value, so compare wall-clock strings.
  return normaliseWallClock(sh.start_time) > nowLocal ? "scheduled" : "awaiting_completion";
}
