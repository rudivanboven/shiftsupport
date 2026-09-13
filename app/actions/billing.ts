"use server";

import { revalidatePath } from "next/cache";

import { requireRetailer, requireWorker } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/site";
import { priceShift } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHECKOUT_KIND,
  getStripe,
  isStripeConfigured,
  membershipPriceId,
} from "@/lib/stripe/client";
import {
  applyShiftCheckout,
  applyShiftCheckoutFailed,
  applyMembershipCheckout,
  applySubscription,
} from "@/lib/stripe/fulfillment";

/**
 * Checkout and billing actions.
 *
 * Rules that hold for everything in this file:
 *   - the caller is resolved from the session (`requireWorker` /
 *     `requireRetailer`), never from the request payload;
 *   - prices come from the server: the membership price id from the
 *     environment, the shift total recomputed from the hours stored on the
 *     shift row. A submitted amount, rate or price id is never read;
 *   - nothing here marks anything as paid. Only Stripe-verified state does
 *     that, through `lib/stripe/fulfillment`.
 */

type ActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const STRIPE_UNAVAILABLE =
  "Payments are not available right now. Please try again in a moment.";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/* ------------------------------------------------------------------ *
 * Worker — membership subscription
 * ------------------------------------------------------------------ */

/**
 * Creates (or reuses) the Stripe customer for this worker.
 * The id is stored on the worker row so a second checkout, and the billing
 * portal, both land on the same customer.
 */
async function ensureCustomer(worker: {
  id: string;
  authUserId: string;
  email: string | null;
  name: string | null;
}) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("workers")
    .select("stripe_customer_id")
    .eq("id", worker.id)
    .maybeSingle();

  const existing = (data as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;

  if (existing) {
    // Make sure it still exists in this Stripe account / mode before reusing.
    try {
      const customer = await getStripe().customers.retrieve(existing);
      if (!customer.deleted) return existing;
    } catch {
      // Falls through and creates a fresh customer below.
    }
  }

  const customer = await getStripe().customers.create({
    email: worker.email ?? undefined,
    name: worker.name ?? undefined,
    metadata: { auth_user_id: worker.authUserId, worker_id: worker.id },
  });

  await supabase
    .from("workers")
    .update({ stripe_customer_id: customer.id, membership_updated_at: new Date().toISOString() })
    .eq("id", worker.id);

  return customer.id;
}

/** Starts the $18/year membership subscription checkout for the signed-in worker. */
export async function startMembershipCheckout(): Promise<ActionResult> {
  const { user, profile, worker } = await requireWorker();

  if (!isStripeConfigured()) {
    console.error("[billing] Membership checkout requested but Stripe is not configured.");
    return fail(STRIPE_UNAVAILABLE);
  }

  try {
    const customerId = await ensureCustomer({
      id: worker.id,
      authUserId: user.id,
      email: profile.email ?? user.email ?? null,
      name: profile.full_name ?? worker.full_name ?? null,
    });

    const origin = await getSiteUrl();

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // The price is read from the server environment only — a price id in the
      // request would be ignored, because nothing here looks at one.
      line_items: [{ price: membershipPriceId(), quantity: 1 }],
      success_url: `${origin}/worker/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/worker/pricing?checkout=canceled`,
      client_reference_id: user.id,
      metadata: {
        kind: CHECKOUT_KIND.workerMembership,
        auth_user_id: user.id,
        worker_id: worker.id,
      },
      subscription_data: {
        metadata: {
          kind: CHECKOUT_KIND.workerMembership,
          auth_user_id: user.id,
          worker_id: worker.id,
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) return fail(STRIPE_UNAVAILABLE);
    return { ok: true, url: session.url };
  } catch (error) {
    console.error("[billing] startMembershipCheckout failed:", error);
    return fail(STRIPE_UNAVAILABLE);
  }
}

/**
 * Opens the Stripe Billing Portal so a worker can update their card or cancel.
 * Requires the Customer Portal to be configured in the Stripe Dashboard.
 */
export async function openBillingPortal(): Promise<ActionResult> {
  const { worker } = await requireWorker();

  if (!isStripeConfigured()) return fail(STRIPE_UNAVAILABLE);

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workers")
    .select("stripe_customer_id")
    .eq("id", worker.id)
    .maybeSingle();

  const customerId = (data as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;

  if (!customerId) {
    return fail("There's no membership to manage yet. Start your membership first.");
  }

  try {
    const origin = await getSiteUrl();
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/worker/pricing`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    console.error("[billing] openBillingPortal failed:", error);
    return fail(
      "The billing portal isn't available yet. Please contact ShiftSupport support.",
    );
  }
}

/**
 * Re-reads membership state from Stripe for the signed-in worker.
 *
 * Used by the success screen so a worker is not left staring at "confirming…"
 * if the webhook is slow, misconfigured, or not reachable in development.
 * It never trusts the redirect: the session/subscription is fetched from
 * Stripe and run through the same fulfillment code the webhook uses.
 */
export async function syncMembership(sessionId?: string): Promise<{ ok: boolean }> {
  const { worker } = await requireWorker();
  if (!isStripeConfigured()) return { ok: false };

  try {
    if (sessionId) {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      // Only this worker's own session may be applied.
      if (session.metadata?.worker_id !== worker.id) return { ok: false };
      await applyMembershipCheckout(session);
    } else {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("workers")
        .select("stripe_subscription_id")
        .eq("id", worker.id)
        .maybeSingle();

      const subscriptionId = (data as { stripe_subscription_id: string | null } | null)
        ?.stripe_subscription_id;
      if (!subscriptionId) return { ok: false };

      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription);
    }

    revalidatePath("/worker/pricing");
    revalidatePath("/worker/available-shifts");
    revalidatePath("/worker/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[billing] syncMembership failed:", error);
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ *
 * Retailer — shift payment
 * ------------------------------------------------------------------ */

/**
 * Creates the one-time Checkout session that pays for a shift.
 *
 * The amount is recomputed here from the hours stored on the shift, at the
 * platform rate held in `lib/pricing` — the browser cannot send a total, a
 * rate or a price id that this function would read.
 */
export async function createShiftPaymentSession(shiftId: string): Promise<ActionResult> {
  const { user, store } = await requireRetailer();

  if (!isStripeConfigured()) {
    console.error("[billing] Shift checkout requested but Stripe is not configured.");
    return fail(STRIPE_UNAVAILABLE);
  }

  const admin = createAdminClient();

  const { data: shift, error } = await admin
    .from("shifts")
    .select("id,store_id,task_type,start_time,duration,status,payment_status")
    .eq("id", shiftId)
    .maybeSingle();

  if (error || !shift) return fail("That shift no longer exists.");

  // A retailer can only ever pay for their own store's shift.
  if (shift.store_id !== store.id) {
    return fail("You don't have access to that shift.");
  }

  if (shift.payment_status === "paid") {
    return fail("This shift has already been paid for.");
  }
  if (shift.status === "cancelled") {
    return fail("This shift was cancelled, so it can't be paid for.");
  }

  const hours = Number(shift.duration);
  if (!Number.isFinite(hours) || hours <= 0) {
    return fail("This shift has no valid duration, so it can't be priced.");
  }

  const pricing = priceShift(hours);
  const amountCents = Math.round(pricing.retailerTotal * 100);
  if (amountCents <= 0) return fail("This shift has no payable amount.");

  try {
    // A retailer who abandoned checkout and came back gets the session they
    // already have, so one shift cannot end up with two live payment pages —
    // and cannot be charged twice for the same booking.
    const { data: existing } = await admin
      .from("shift_payments")
      .select("stripe_checkout_session_id,status,amount_cents")
      .eq("shift_id", shift.id)
      .maybeSingle();

    const openPayment = existing as
      | { stripe_checkout_session_id: string; status: string; amount_cents: number }
      | null;

    if (openPayment?.status === "pending" && openPayment.amount_cents === amountCents) {
      try {
        const previous = await getStripe().checkout.sessions.retrieve(
          openPayment.stripe_checkout_session_id,
        );
        if (previous.status === "open" && previous.url) {
          return { ok: true, url: previous.url };
        }
      } catch {
        // The old session is gone or unreadable — fall through and make a new one.
      }
    }

    const origin = await getSiteUrl();

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      // A shift total is a different number for every duration, so the line
      // item is built server-side instead of keeping a Stripe Price per shift.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `ShiftSupport shift — ${shift.task_type}`,
              description: `${hours} hour${hours === 1 ? "" : "s"} at $${pricing.hourlyRate}/hour`,
            },
          },
        },
      ],
      success_url: `${origin}/retailer/shifts/${shift.id}/payment?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/retailer/shifts/${shift.id}/payment?canceled=1`,
      client_reference_id: user.id,
      metadata: {
        kind: CHECKOUT_KIND.retailerShift,
        shift_id: shift.id,
        store_id: store.id,
        auth_user_id: user.id,
        hours: String(hours),
      },
      payment_intent_data: {
        metadata: {
          kind: CHECKOUT_KIND.retailerShift,
          shift_id: shift.id,
          store_id: store.id,
        },
      },
    });

    if (!session.url) return fail(STRIPE_UNAVAILABLE);

    // One payment row per shift: a retailer who abandons checkout and starts
    // again updates this row rather than collecting a second one.
    const now = new Date().toISOString();
    const { error: paymentError } = await admin.from("shift_payments").upsert(
      {
        shift_id: shift.id,
        store_id: store.id,
        stripe_checkout_session_id: session.id,
        amount_cents: amountCents,
        currency: "usd",
        status: "pending",
        hours,
        hourly_rate: pricing.hourlyRate,
        worker_gross_cents: Math.round(pricing.workerGross * 100),
        platform_portion_cents: Math.round(pricing.platformPortion * 100),
        created_by: user.id,
        updated_at: now,
      },
      { onConflict: "shift_id" },
    );

    if (paymentError) {
      console.error("[billing] Could not record the pending payment:", paymentError);
      return fail(STRIPE_UNAVAILABLE);
    }

    await admin
      .from("shifts")
      .update({ payment_status: "pending", updated_at: now })
      .eq("id", shift.id)
      .neq("payment_status", "paid");

    return { ok: true, url: session.url };
  } catch (stripeError) {
    console.error("[billing] createShiftPaymentSession failed:", stripeError);
    return fail(STRIPE_UNAVAILABLE);
  }
}

/**
 * Re-reads a shift's Checkout session from Stripe and applies the result.
 *
 * The success screen calls this instead of believing its own query string:
 * `?session_id=…` only tells us which session to ask Stripe about, and Stripe's
 * answer is what publishes the shift.
 */
export async function syncShiftPayment(
  shiftId: string,
): Promise<{ ok: boolean; paid: boolean }> {
  const { store } = await requireRetailer();
  if (!isStripeConfigured()) return { ok: false, paid: false };

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("shift_payments")
    .select("stripe_checkout_session_id,store_id,shift_id")
    .eq("shift_id", shiftId)
    .maybeSingle();

  const row = payment as
    | { stripe_checkout_session_id: string; store_id: string; shift_id: string }
    | null;

  // Ownership is checked against the payment row's store, not the caller's
  // claim, so one retailer cannot poll another retailer's payment.
  if (!row || row.store_id !== store.id) return { ok: false, paid: false };

  try {
    const session = await getStripe().checkout.sessions.retrieve(
      row.stripe_checkout_session_id,
    );

    if (session.payment_status === "paid") {
      await applyShiftCheckout(session);
      revalidatePath("/retailer/shifts");
      revalidatePath("/retailer/dashboard");
      revalidatePath(`/retailer/shifts/${shiftId}/payment`);
      return { ok: true, paid: true };
    }

    if (session.status === "expired") {
      await applyShiftCheckoutFailed(session);
    }

    return { ok: true, paid: false };
  } catch (error) {
    console.error("[billing] syncShiftPayment failed:", error);
    return { ok: false, paid: false };
  }
}
