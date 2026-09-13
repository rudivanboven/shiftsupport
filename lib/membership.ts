import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Worker membership, read from the database.
 *
 * The browser never gets a say in this: the columns below are written only by
 * the Stripe webhook (and the server-side reconciliation that re-reads a
 * session from Stripe), and the database enforces the same rule again in the
 * INSERT policy on `shift_applications` — see migration 0007.
 */

export type MembershipStatus = "inactive" | "active" | "past_due" | "canceled";

export interface Membership {
  status: MembershipStatus;
  startedAt: string | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** True when this worker may browse and apply for shifts. */
  active: boolean;
  /** Set when the membership columns could not be read at all. */
  unavailable?: boolean;
}

const INACTIVE: Membership = {
  status: "inactive",
  startedAt: null,
  expiresAt: null,
  cancelAtPeriodEnd: false,
  active: false,
};

/**
 * The same rule as `public.membership_grants_access` in the database: a paid
 * period that has not run out yet. `past_due` keeps access until the period
 * Stripe already collected for ends, so one failed renewal does not lock a
 * worker out of a shift they are booked on.
 */
export function grantsAccess(
  status: MembershipStatus | string | null | undefined,
  expiresAt: string | null,
): boolean {
  if (status !== "active" && status !== "past_due") return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

/**
 * The signed-in worker's membership. `cache()` keeps it to one query per
 * request, the same way the session helpers do.
 */
export const getMembership = cache(async (workerId: string): Promise<Membership> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workers")
    .select(
      "membership_status,membership_started_at,membership_expires_at,membership_cancel_at_period_end",
    )
    .eq("id", workerId)
    .maybeSingle();

  if (error) {
    // Most likely cause: migration 0007 has not been run on this database yet.
    // Fail closed — an unverifiable membership is not an active one — but say
    // so in the log rather than pretending the worker was refused.
    console.error("[membership] Could not read membership state:", error.message);
    return { ...INACTIVE, unavailable: true };
  }

  if (!data) return INACTIVE;

  const row = data as {
    membership_status: MembershipStatus | null;
    membership_started_at: string | null;
    membership_expires_at: string | null;
    membership_cancel_at_period_end: boolean | null;
  };

  const status = (row.membership_status ?? "inactive") as MembershipStatus;

  return {
    status,
    startedAt: row.membership_started_at,
    expiresAt: row.membership_expires_at,
    cancelAtPeriodEnd: Boolean(row.membership_cancel_at_period_end),
    active: grantsAccess(status, row.membership_expires_at),
  };
});

/** Copy for the locked state, chosen from why the worker is locked out. */
export function membershipNotice(membership: Membership): {
  title: string;
  text: string;
  cta: string;
} {
  switch (membership.status) {
    case "past_due":
      return {
        title: "Your membership payment needs attention",
        text: "Stripe could not take your last membership payment. Update your payment details to keep access to available shifts.",
        cta: "Manage membership",
      };
    case "canceled":
      return {
        title: "Your membership has ended",
        text: "Renew your Worker Membership to see available shifts and apply for local work again.",
        cta: "Renew membership",
      };
    default:
      return {
        title: "Activate your Worker Membership to access available shifts",
        text: "Your membership gives you access to eligible shift opportunities from local retailers, and lets you apply for the ones that fit your schedule.",
        cta: "Activate membership",
      };
  }
}
