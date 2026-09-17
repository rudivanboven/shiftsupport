import "server-only";

import {
  PLATFORM_HOURLY_PORTION,
  RETAILER_HOURLY_RATE,
  WORKER_HOURLY_RATE,
} from "@/lib/pricing";
import {
  addDays,
  bucketsFor,
  instantInRange,
  localDateOf,
  todayLocal,
  wallClockDate,
  wallClockInRange,
  type Bucket,
  type DateRange,
} from "./dates";
import {
  isOpenShift,
  membershipGrantsAccess,
  membershipView,
  type AdminPayment,
  type AdminShift,
  type Snapshot,
} from "./snapshot";

/**
 * Every number the Operations Control Center shows, derived from one snapshot.
 *
 * Money only ever comes from `shift_payments` rows Stripe confirmed as paid.
 * Nothing here treats an unpaid or draft shift as revenue; scheduled totals are
 * labelled as estimates wherever they appear.
 */

/** How far back a worker/retailer counts as "active". */
export const ACTIVITY_WINDOW_DAYS = 30;

const dayOf = (instant: string | null | undefined) => (instant ? localDateOf(instant) : null);

interface Window {
  today: string;
  d7: string;
  d30: string;
}

const windows = (): Window => {
  const today = todayLocal();
  return { today, d7: addDays(today, -6), d30: addDays(today, -29) };
};

const countSince = <T>(items: T[], date: (item: T) => string | null, since: string) =>
  items.filter((item) => {
    const d = date(item);
    return d !== null && d >= since;
  }).length;

/* ------------------------------------------------------------------ money */

export const centsToDollars = (cents: number) => Math.round(cents) / 100;

/**
 * The worker gross and platform portion behind a confirmed payment. Uses the
 * split recorded at checkout; falls back to the hours on the payment row, and
 * only then to the platform's own rate ratio.
 */
export function paymentSplit(payment: AdminPayment) {
  const amount = payment.amount_cents;
  const workerGross =
    payment.worker_gross_cents ??
    (payment.hours ? Math.round(payment.hours * WORKER_HOURLY_RATE * 100) : Math.round((amount * WORKER_HOURLY_RATE) / RETAILER_HOURLY_RATE));
  const platform =
    payment.platform_portion_cents ??
    (payment.hours ? Math.round(payment.hours * PLATFORM_HOURLY_PORTION * 100) : amount - workerGross);
  return { amount, workerGross, platform };
}

export interface MoneyTotals {
  count: number;
  amountCents: number;
  workerGrossCents: number;
  platformCents: number;
}

export function moneyTotals(payments: AdminPayment[]): MoneyTotals {
  return payments.reduce<MoneyTotals>(
    (totals, payment) => {
      const split = paymentSplit(payment);
      return {
        count: totals.count + 1,
        amountCents: totals.amountCents + split.amount,
        workerGrossCents: totals.workerGrossCents + split.workerGross,
        platformCents: totals.platformCents + split.platform,
      };
    },
    { count: 0, amountCents: 0, workerGrossCents: 0, platformCents: 0 },
  );
}

export const paidPayments = (s: Snapshot) => s.payments.filter((p) => p.status === "paid" && p.paid_at);

/* ------------------------------------------------------------------ people */

/** Applied for or worked a shift within the activity window. */
export function activeWorkerIds(s: Snapshot): Set<string> {
  const since = addDays(todayLocal(), -(ACTIVITY_WINDOW_DAYS - 1));
  const ids = new Set<string>();
  for (const a of s.applications) {
    if (localDateOf(a.applied_at) >= since) ids.add(a.worker_id);
  }
  for (const shift of s.shifts) {
    if (shift.accepted_by && wallClockDate(shift.start_time) >= since) ids.add(shift.accepted_by);
  }
  return ids;
}

/** Posted a shift within the activity window. */
export function activeStoreIds(s: Snapshot): Set<string> {
  const since = addDays(todayLocal(), -(ACTIVITY_WINDOW_DAYS - 1));
  const ids = new Set<string>();
  for (const shift of s.shifts) {
    if (shift.created_at && localDateOf(shift.created_at) >= since) ids.add(shift.store_id);
  }
  return ids;
}

/* ------------------------------------------------------------------ summary */

export interface Summary {
  workers: {
    total: number;
    today: number;
    last7: number;
    last30: number;
    active: number;
    inactive: number;
    paidMemberships: number;
    complimentary: number;
    inactiveMemberships: number;
  };
  retailers: {
    total: number;
    today: number;
    last7: number;
    last30: number;
    active: number;
    stores: number;
  };
  shifts: {
    today: number;
    week: number;
    month: number;
    open: number;
    hired: number;
    completed: number;
    draft: number;
    cancelled: number;
    total: number;
  };
  applications: {
    today: number;
    week: number;
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  finance: {
    today: MoneyTotals;
    last7: MoneyTotals;
    last30: MoneyTotals;
    allTime: MoneyTotals;
    pendingCount: number;
    pendingCents: number;
    completedPaidShifts: number;
    legacyShifts: number;
  };
}

export function summarise(s: Snapshot): Summary {
  const { today, d7, d30 } = windows();
  const active = activeWorkerIds(s);
  const activeStores = activeStoreIds(s);
  const paid = paidPayments(s);

  const inWindow = (since: string) => paid.filter((p) => localDateOf(p.paid_at!) >= since);

  const retailerUsers = s.storeUsers;
  const hired = s.shifts.filter((sh) => sh.accepted_by && sh.status !== "cancelled");

  return {
    workers: {
      total: s.workers.length,
      today: countSince(s.workers, (w) => dayOf(w.created_at), today),
      last7: countSince(s.workers, (w) => dayOf(w.created_at), d7),
      last30: countSince(s.workers, (w) => dayOf(w.created_at), d30),
      active: s.workers.filter((w) => active.has(w.id)).length,
      inactive: s.workers.filter((w) => !active.has(w.id)).length,
      paidMemberships: s.workers.filter((w) => membershipView(w) === "paid_active").length,
      complimentary: s.workers.filter((w) => membershipView(w) === "complimentary").length,
      inactiveMemberships: s.workers.filter((w) => !membershipGrantsAccess(w)).length,
    },
    retailers: {
      total: retailerUsers.length,
      today: countSince(retailerUsers, (u) => dayOf(u.created_at), today),
      last7: countSince(retailerUsers, (u) => dayOf(u.created_at), d7),
      last30: countSince(retailerUsers, (u) => dayOf(u.created_at), d30),
      active: activeStores.size,
      stores: s.stores.length,
    },
    shifts: {
      today: countSince(s.shifts, (sh) => dayOf(sh.created_at), today),
      week: countSince(s.shifts, (sh) => dayOf(sh.created_at), d7),
      month: countSince(s.shifts, (sh) => dayOf(sh.created_at), d30),
      open: s.shifts.filter(isOpenShift).length,
      hired: hired.length,
      completed: s.shifts.filter((sh) => sh.status === "completed").length,
      draft: s.shifts.filter((sh) => sh.status === "draft").length,
      cancelled: s.shifts.filter((sh) => sh.status === "cancelled").length,
      total: s.shifts.length,
    },
    applications: {
      today: countSince(s.applications, (a) => dayOf(a.applied_at), today),
      week: countSince(s.applications, (a) => dayOf(a.applied_at), d7),
      pending: s.applications.filter((a) => a.status === "pending").length,
      approved: s.applications.filter((a) => a.status === "approved").length,
      rejected: s.applications.filter((a) => a.status === "rejected").length,
      total: s.applications.length,
    },
    finance: {
      today: moneyTotals(inWindow(today)),
      last7: moneyTotals(inWindow(d7)),
      last30: moneyTotals(inWindow(d30)),
      allTime: moneyTotals(paid),
      pendingCount: s.payments.filter((p) => p.status === "pending").length,
      pendingCents: s.payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount_cents, 0),
      completedPaidShifts: paid.filter((p) => s.shiftById.get(p.shift_id)?.status === "completed").length,
      legacyShifts: s.shifts.filter((sh) => sh.payment_status === "legacy").length,
    },
  };
}

/* ------------------------------------------------------------------ trends */

export interface RangeMetrics {
  workerSignups: number;
  retailerSignups: number;
  shiftsPosted: number;
  applications: number;
  hires: number;
  completed: number;
  payments: MoneyTotals;
  charts: {
    workers: Bucket[];
    retailers: Bucket[];
    shifts: Bucket[];
    applications: Bucket[];
    hires: Bucket[];
    completed: Bucket[];
    revenue: Bucket[];
  };
}

/** When a shift's hire happened, from the accepts ledger or the application. */
function hireDate(s: Snapshot, shift: AdminShift): string | null {
  const accept = s.accepts.find((a) => a.shift_id === shift.id);
  if (accept?.accepted_at) return localDateOf(accept.accepted_at);
  const approved = (s.applicationsByShift.get(shift.id) ?? []).find((a) => a.status === "approved" && a.reviewed_at);
  return approved?.reviewed_at ? localDateOf(approved.reviewed_at) : null;
}

export function rangeMetrics(s: Snapshot, range: DateRange): RangeMetrics {
  const series = () => {
    const { buckets, keyOf } = bucketsFor(range);
    const index = new Map(buckets.map((b) => [b.key, b]));
    return {
      buckets,
      add(date: string | null, amount = 1) {
        if (!date) return;
        const key = keyOf(date);
        if (key) index.get(key)!.value += amount;
      },
    };
  };

  const workers = series();
  const retailers = series();
  const shifts = series();
  const applications = series();
  const hires = series();
  const completed = series();
  const revenue = series();

  for (const w of s.workers) {
    if (instantInRange(w.created_at, range)) workers.add(dayOf(w.created_at));
  }
  for (const u of s.storeUsers) {
    if (instantInRange(u.created_at, range)) retailers.add(dayOf(u.created_at));
  }
  for (const sh of s.shifts) {
    if (instantInRange(sh.created_at, range)) shifts.add(dayOf(sh.created_at));
    if (sh.completed_at && instantInRange(sh.completed_at, range)) completed.add(dayOf(sh.completed_at));
    if (sh.accepted_by && sh.status !== "cancelled") {
      const hired = hireDate(s, sh);
      if (hired && (!range.from || (hired >= range.from && hired <= (range.to ?? hired)))) hires.add(hired);
    }
  }
  for (const a of s.applications) {
    if (instantInRange(a.applied_at, range)) applications.add(dayOf(a.applied_at));
  }

  const paidInRange = paidPayments(s).filter((p) => instantInRange(p.paid_at, range));
  for (const p of paidInRange) revenue.add(dayOf(p.paid_at), centsToDollars(p.amount_cents));

  const total = (buckets: Bucket[]) => buckets.reduce((sum, b) => sum + b.value, 0);

  return {
    workerSignups: total(workers.buckets),
    retailerSignups: total(retailers.buckets),
    shiftsPosted: total(shifts.buckets),
    applications: total(applications.buckets),
    hires: total(hires.buckets),
    completed: total(completed.buckets),
    payments: moneyTotals(paidInRange),
    charts: {
      workers: workers.buckets,
      retailers: retailers.buckets,
      shifts: shifts.buckets,
      applications: applications.buckets,
      hires: hires.buckets,
      completed: completed.buckets,
      revenue: revenue.buckets,
    },
  };
}

/** Shifts whose scheduled date falls in the range (wall-clock, not instants). */
export const shiftsInRange = (s: Snapshot, range: DateRange) =>
  s.shifts.filter((sh) => wallClockInRange(sh.start_time, range));
