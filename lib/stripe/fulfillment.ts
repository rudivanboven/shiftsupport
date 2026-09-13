import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { priceShift } from "@/lib/pricing";
import { CHECKOUT_KIND, getStripe } from "./client";

/**
 * Turning verified Stripe state into database state.
 *
 * Everything here is driven by an object fetched from (or signed by) Stripe —
 * never by a query parameter, a form field or a redirect. Both callers use it:
 *
 *   - the webhook, which is the authoritative path, and
 *   - the "confirming your payment…" screens, which re-read the session from
 *     Stripe directly so a delayed or unconfigured webhook cannot leave a paid
 *     shift stuck in draft.
 *
 * Both paths are idempotent, so it does not matter which arrives first, or how
 * many times Stripe redelivers the same event.
 */

type Admin = ReturnType<typeof createAdminClient>;

/* ------------------------------------------------------------------ *
 * Idempotency ledger
 * ------------------------------------------------------------------ */

/**
 * Claims a Stripe event id. Returns false when this event has already been
 * recorded, which is the signal to skip the work entirely — a redelivered
 * `checkout.session.completed` must not publish a shift twice.
 */
export async function claimStripeEvent(event: Stripe.Event): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    api_version: event.api_version ?? null,
    livemode: event.livemode,
  });

  // 23505 = unique violation: we have seen this event id before.
  if (error?.code === "23505") return false;
  if (error) throw new Error(`Could not record Stripe event: ${error.message}`);

  return true;
}

export async function markStripeEventProcessed(eventId: string, failure?: unknown) {
  const supabase = createAdminClient();
  await supabase
    .from("stripe_events")
    .update({
      processed_at: new Date().toISOString(),
      error: failure ? String(failure instanceof Error ? failure.message : failure).slice(0, 500) : null,
    })
    .eq("id", eventId);
}

/**
 * Releases a claimed event id after a failed attempt, so Stripe's retry can
 * try again instead of being swallowed by the idempotency check.
 */
export async function releaseStripeEvent(eventId: string) {
  const supabase = createAdminClient();
  await supabase.from("stripe_events").delete().eq("id", eventId);
}

/* ------------------------------------------------------------------ *
 * Worker membership
 * ------------------------------------------------------------------ */

export type MembershipStatus = "inactive" | "active" | "past_due" | "canceled";

/** Stripe's subscription status, mapped onto the four states we store. */
export function membershipStatusFor(status: Stripe.Subscription.Status): MembershipStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete / paused — the customer has not completed payment.
      return "inactive";
  }
}

/**
 * The end of the period the customer has already paid for. Stripe moved this
 * onto the subscription item in recent API versions, so both places are read.
 */
function currentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const item = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  const fromItem = item?.current_period_end;
  const fromSubscription = (subscription as Stripe.Subscription & {
    current_period_end?: number;
  }).current_period_end;

  return fromItem ?? fromSubscription ?? null;
}

const toIso = (seconds: number | null | undefined) =>
  typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;

/**
 * Finds the worker a subscription belongs to, without trusting anything the
 * customer could have typed: the subscription/customer ids we stored, then the
 * metadata we attached ourselves when the Checkout session was created.
 */
async function findWorkerForSubscription(
  supabase: Admin,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const bySubscription = await supabase
    .from("workers")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (bySubscription.data?.id) return bySubscription.data.id as string;

  if (customerId) {
    const byCustomer = await supabase
      .from("workers")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer.data?.id) return byCustomer.data.id as string;
  }

  const workerId = subscription.metadata?.worker_id;
  if (workerId) {
    const byMetadata = await supabase
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .maybeSingle();
    if (byMetadata.data?.id) return byMetadata.data.id as string;
  }

  const authUserId = subscription.metadata?.auth_user_id;
  if (authUserId) {
    const byAuthUser = await supabase
      .from("workers")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (byAuthUser.data?.id) return byAuthUser.data.id as string;
  }

  return null;
}

/**
 * Writes a subscription's current state onto the worker row. Safe to run any
 * number of times with the same subscription: it always writes what Stripe
 * currently says, so out-of-order webhook delivery converges on the truth.
 */
export async function applySubscription(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  const workerId = await findWorkerForSubscription(supabase, subscription);

  if (!workerId) {
    console.warn(
      `[stripe] Subscription ${subscription.id} could not be matched to a worker.`,
    );
    return { matched: false as const };
  }

  const status = membershipStatusFor(subscription.status);
  const periodEnd = toIso(currentPeriodEnd(subscription));
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const { error } = await supabase
    .from("workers")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      membership_status: status,
      membership_started_at: toIso(subscription.start_date) ?? null,
      membership_expires_at: periodEnd,
      membership_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      membership_updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (error) throw new Error(`Could not update membership: ${error.message}`);

  return { matched: true as const, workerId, status };
}

/** `customer.subscription.deleted` — the subscription is over. */
export async function applySubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  const workerId = await findWorkerForSubscription(supabase, subscription);
  if (!workerId) return { matched: false as const };

  const { error } = await supabase
    .from("workers")
    .update({
      membership_status: "canceled",
      // Access ends when the paid period ends, which for a deleted
      // subscription is `ended_at` if Stripe reports one.
      membership_expires_at:
        toIso(subscription.ended_at) ?? toIso(currentPeriodEnd(subscription)),
      membership_cancel_at_period_end: false,
      membership_updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (error) throw new Error(`Could not end membership: ${error.message}`);
  return { matched: true as const, workerId };
}

/** `invoice.payment_failed` — recurring payment did not go through. */
export async function applyInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return { matched: false as const };

  // Stripe's own subscription status is the source of truth for what this
  // failure means (a first failure may still leave the subscription active).
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return applySubscription(subscription);
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as Stripe.Invoice & { subscription?: string | { id: string } })
    .subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") return direct.id;

  // Newer API versions carry it on the invoice line's parent instead.
  for (const line of invoice.lines?.data ?? []) {
    const parent = (line as Stripe.InvoiceLineItem & {
      parent?: { subscription_item_details?: { subscription?: string } };
    }).parent;
    const fromLine = parent?.subscription_item_details?.subscription;
    if (typeof fromLine === "string") return fromLine;
  }

  return null;
}

/**
 * A completed membership Checkout session. The subscription is re-read from
 * Stripe rather than trusting the session payload alone.
 */
export async function applyMembershipCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status === "unpaid") return { matched: false as const };

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!subscriptionId) return { matched: false as const };

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);

  // Carry the ids we attached at creation time onto the subscription, so a
  // later `customer.subscription.updated` can still find its worker.
  if (!subscription.metadata?.worker_id && session.metadata?.worker_id) {
    subscription.metadata = { ...subscription.metadata, ...session.metadata };
  }

  return applySubscription(subscription);
}

/* ------------------------------------------------------------------ *
 * Retailer shift payment
 * ------------------------------------------------------------------ */

export interface ShiftPaymentResult {
  published: boolean;
  shiftId: string | null;
  reason?: string;
}

/**
 * A completed shift Checkout session: record the payment and publish the shift.
 *
 * Every value written here comes from Stripe (the amount actually paid) or
 * from the shift row itself (the hours the server stored) — never from the
 * browser that came back to the success URL.
 */
export async function applyShiftCheckout(
  session: Stripe.Checkout.Session,
): Promise<ShiftPaymentResult> {
  const supabase = createAdminClient();
  const shiftId = session.metadata?.shift_id ?? null;

  if (!shiftId) return { published: false, shiftId: null, reason: "no_shift_metadata" };
  if (session.payment_status !== "paid") {
    return { published: false, shiftId, reason: `payment_status:${session.payment_status}` };
  }

  const { data: shift } = await supabase
    .from("shifts")
    .select("id,store_id,status,payment_status,duration")
    .eq("id", shiftId)
    .maybeSingle();

  if (!shift) return { published: false, shiftId, reason: "shift_not_found" };

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const amountCents = session.amount_total ?? 0;
  const pricing = priceShift(Number(shift.duration) || 0);
  const expectedCents = Math.round(pricing.retailerTotal * 100);
  const paidAt = new Date().toISOString();

  // The amount charged is Stripe's, and the amount owed is the server's. They
  // should always agree; if they ever do not, the payment is still recorded
  // (the retailer really was charged) but the discrepancy is made loud.
  if (amountCents !== expectedCents) {
    console.error(
      `[stripe] Amount mismatch on shift ${shiftId}: charged ${amountCents}, expected ${expectedCents}.`,
    );
  }

  // The payment row is keyed by the Checkout session, so a replayed event
  // updates the same row instead of creating a second payment.
  const { error: paymentError } = await supabase
    .from("shift_payments")
    .update({
      stripe_payment_intent_id: paymentIntentId,
      status: "paid",
      amount_cents: amountCents,
      paid_at: paidAt,
      updated_at: paidAt,
    })
    .eq("stripe_checkout_session_id", session.id);

  if (paymentError) {
    throw new Error(`Could not record the shift payment: ${paymentError.message}`);
  }

  // Already paid: nothing left to publish, and nothing to overwrite.
  if (shift.payment_status === "paid") {
    return { published: false, shiftId, reason: "already_paid" };
  }

  // A cancelled shift that somehow gets paid is recorded, not resurrected.
  const nextStatus = shift.status === "draft" ? "open" : shift.status;

  const { error: shiftError } = await supabase
    .from("shifts")
    .update({
      status: nextStatus,
      payment_status: "paid",
      amount_paid_cents: amountCents,
      paid_at: paidAt,
      published_at: nextStatus === "open" ? paidAt : null,
      updated_at: paidAt,
    })
    .eq("id", shiftId)
    // The guard that makes a double delivery harmless even if two webhook
    // workers run at once: only a not-yet-paid row is updated.
    .neq("payment_status", "paid");

  if (shiftError) throw new Error(`Could not publish the shift: ${shiftError.message}`);

  console.info(`[stripe] Shift ${shiftId} paid (${amountCents} cents).`);

  return { published: nextStatus === "open", shiftId };
}

/** `checkout.session.expired` / a cancelled payment — the shift stays a draft. */
export async function applyShiftCheckoutFailed(
  session: Stripe.Checkout.Session,
  status: "failed" | "canceled" = "canceled",
) {
  const supabase = createAdminClient();

  await supabase
    .from("shift_payments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");

  const shiftId = session.metadata?.shift_id;
  if (!shiftId) return;

  await supabase
    .from("shifts")
    .update({ payment_status: "unpaid", updated_at: new Date().toISOString() })
    .eq("id", shiftId)
    .eq("payment_status", "pending");
}

/**
 * Routes a completed Checkout session to the right handler using the `kind`
 * we set in metadata when the session was created.
 */
export async function applyCheckoutSession(session: Stripe.Checkout.Session) {
  switch (session.metadata?.kind) {
    case CHECKOUT_KIND.workerMembership:
      return applyMembershipCheckout(session);
    case CHECKOUT_KIND.retailerShift:
      return applyShiftCheckout(session);
    default:
      console.warn(`[stripe] Checkout session ${session.id} has no known kind metadata.`);
      return { matched: false as const };
  }
}
