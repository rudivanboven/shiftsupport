import "server-only";

import { contactLinks, type ContactLinks } from "./contact";
import {
  activeStoreIds,
  activeWorkerIds,
  moneyTotals,
  type MoneyTotals,
} from "./metrics";
import {
  membershipView,
  retailerContact,
  storeRating,
  workerContact,
  workerRating,
  type AdminShift,
  type AdminStore,
  type AdminWorker,
  type MembershipView,
  type Snapshot,
} from "./snapshot";

/** One row of the Super Admin worker directory. */
export interface WorkerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact: ContactLinks;
  createdAt: string | null;
  membership: MembershipView;
  membershipStartedAt: string | null;
  membershipExpiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeSubscription: boolean;
  applications: number;
  pendingApplications: number;
  hired: number;
  completed: number;
  ratingAverage: number | null;
  ratingCount: number;
  active: boolean;
  payrollEmployeeId: string | null;
}

export function workerRows(s: Snapshot): WorkerRow[] {
  const active = activeWorkerIds(s);
  const payrollIds = new Map(s.payrollIds.filter((p) => p.provider === "adp").map((p) => [p.worker_id, p.external_employee_id]));

  return s.workers.map((worker) => {
    const contact = workerContact(s, worker);
    const applications = s.applicationsByWorker.get(worker.id) ?? [];
    const shifts = s.shiftsByWorker.get(worker.id) ?? [];
    const rating = workerRating(s, worker);

    return {
      id: worker.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      contact: contactLinks(contact.phone, contact.email),
      createdAt: worker.created_at,
      membership: membershipView(worker),
      membershipStartedAt: worker.membership_started_at,
      membershipExpiresAt: worker.membership_expires_at,
      cancelAtPeriodEnd: Boolean(worker.membership_cancel_at_period_end),
      hasStripeSubscription: Boolean(worker.stripe_subscription_id),
      applications: applications.length,
      pendingApplications: applications.filter((a) => a.status === "pending").length,
      hired: shifts.filter((sh) => sh.status !== "cancelled").length,
      completed: shifts.filter((sh) => sh.status === "completed").length,
      ratingAverage: rating.average,
      ratingCount: rating.total,
      active: active.has(worker.id),
      payrollEmployeeId: payrollIds.get(worker.id) ?? null,
    };
  });
}

export const findWorker = (s: Snapshot, id: string): AdminWorker | undefined => s.workerById.get(id);

/** One row of the Super Admin retailer/store directory. */
export interface RetailerRow {
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeContact: ContactLinks;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contact: ContactLinks;
  accountCreatedAt: string | null;
  storeCreatedAt: string | null;
  shiftsPosted: number;
  paidShifts: number;
  openShifts: number;
  completedShifts: number;
  draftShifts: number;
  paid: MoneyTotals;
  ratingAverage: number | null;
  ratingCount: number;
  active: boolean;
}

export function retailerRows(s: Snapshot): RetailerRow[] {
  const activeStores = activeStoreIds(s);

  return s.stores.map((store: AdminStore) => {
    const shifts: AdminShift[] = s.shiftsByStore.get(store.id) ?? [];
    const person = retailerContact(s, store.id);
    const rating = storeRating(s, store.id);
    const payments = s.payments.filter((p) => p.store_id === store.id && p.status === "paid");

    return {
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.contact_phone,
      storeContact: contactLinks(store.contact_phone, person.email),
      contactName: person.name,
      contactEmail: person.email,
      contactPhone: person.phone,
      contact: contactLinks(person.phone ?? store.contact_phone, person.email),
      accountCreatedAt: person.accountCreatedAt,
      storeCreatedAt: store.created_at,
      shiftsPosted: shifts.length,
      paidShifts: shifts.filter((sh) => sh.payment_status === "paid").length,
      openShifts: shifts.filter((sh) => sh.status === "open" && !sh.accepted_by).length,
      completedShifts: shifts.filter((sh) => sh.status === "completed").length,
      draftShifts: shifts.filter((sh) => sh.status === "draft").length,
      paid: moneyTotals(payments),
      ratingAverage: rating.average,
      ratingCount: rating.total,
      active: activeStores.has(store.id),
    };
  });
}

export const MEMBERSHIP_LABELS: Record<MembershipView, string> = {
  paid_active: "Paid · active",
  complimentary: "Complimentary",
  past_due: "Past due",
  canceled: "Cancelled",
  expired: "Expired",
  inactive: "No membership",
};

export const MEMBERSHIP_TONES: Record<MembershipView, "approved" | "open" | "pending" | "rejected" | "cancelled" | "neutral"> = {
  paid_active: "approved",
  complimentary: "open",
  past_due: "pending",
  canceled: "cancelled",
  expired: "rejected",
  inactive: "neutral",
};
