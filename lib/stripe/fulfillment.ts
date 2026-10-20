import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { WORKER_SIGNUP_FEE, priceShift } from "@/lib/pricing";
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
 * Worker signup fee — one-time payment (migration 0013)
 * ------------------------------------------------------------------ */

const SIGNUP_LEDGER = "worker_signup_payments";

/**
 * "The table is not there yet" — migration 0013 has not been applied. The
 * code paths below degrade loudly rather than failing, so a worker who has
 * paid is never locked out by a missing ledger.
 */
function isMissingLedger(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return message.includes(SIGNUP_LEDGER) && /schema cache|does not exist/i.test(message);
}

/**
 * True when this worker has paid the one-time signup fee. Their access does
 * not come from a subscription, so the subscription webhooks (an older
 * $18/year subscription on the same worker ending, say) must never take it
 * away. Fails safe to `false` if the ledger cannot be read.
 */
export async function hasPaidSignupFee(supabase: Admin, workerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(SIGNUP_LEDGER)
    .select("id")
    .eq("worker_id", workerId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingLedger(error)) {
      console.error("[stripe] Could not read the signup ledger:", error.message);
    }
    return false;
  }
  return Boolean(data?.id);
}

/**
 * The URL of a signup Checkout session this worker already has open, if any.
 *
 * A worker who abandoned Checkout in one tab and clicks again in another must
 * land on the same session: two open sessions would be two $1 charges, since
 * each one is fulfilled independently. Mirrors the retailer flow's reuse of a
 * pending shift payment. Returns null when there is nothing to reuse (or the
 * ledger cannot be read), and the caller creates a fresh session.
 */
export async function openSignupSessionUrl(workerId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from(SIGNUP_LEDGER)
    .select("stripe_checkout_session_id")
    .eq("worker_id", workerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    if (!isMissingLedger(error)) {
      console.error("[stripe] Could not read pending signup sessions:", error.message);
    }
    return null;
  }

  for (const row of (data ?? []) as { stripe_checkout_session_id: string }[]) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(row.stripe_checkout_session_id);
      const stillOpen =
        session.status === "open" &&
        Boolean(session.url) &&
        (!session.expires_at || session.expires_at * 1000 > Date.now());
      if (stillOpen) return session.url as string;
    } catch {
      // Gone or unreadable: not reusable, try the next one.
    }
  }

  return null;
}

/**
 * True while this worker still has a live legacy $18/year subscription:
 * anything Stripe does not consider finished (`active`, `trialing`,
 * `past_due` with Smart Retries still running, `unpaid`, `incomplete`,
 * `paused`). Such a worker must manage that subscription in the portal,
 * not pay the one-time fee on top of it and then be billed twice. Fails safe
 * to `false` only when there is no subscription on record or Stripe no
 * longer knows it.
 */
export async function hasLiveLegacySubscription(workerId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("workers")
    .select("stripe_subscription_id")
    .eq("id", workerId)
    .maybeSingle();

  const subscriptionId = (data as { stripe_subscription_id: string | null } | null)
    ?.stripe_subscription_id;
  if (!subscriptionId) return false;

  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    return subscription.status !== "canceled" && subscription.status !== "incomplete_expired";
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "resource_missing") return false;
    // Unknown error: assume live, so a transient Stripe problem cannot lead
    // to a double charge.
    console.error("[stripe] Could not read legacy subscription:", error);
    return true;
  }
}

/**
 * Records that a signup Checkout session was opened, so an abandoned, expired
 * or failed session leaves a trace. Non-fatal: the ledger is bookkeeping, the
 * Stripe session itself is what the worker is sent to.
 */
export async function recordSignupCheckoutStarted(
  workerId: string,
  session: Stripe.Checkout.Session,
) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from(SIGNUP_LEDGER).upsert(
    {
      worker_id: workerId,
      stripe_checkout_session_id: session.id,
      stripe_customer_id:
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      amount_cents: session.amount_total ?? Math.round(WORKER_SIGNUP_FEE * 100),
      currency: session.currency ?? "usd",
      status: "pending",
      updated_at: now,
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  if (error) {
    console.error(
      isMissingLedger(error)
        ? "[stripe] Signup checkout opened but not recorded: migration 0013 has not been applied."
        : `[stripe] Could not record the pending signup payment: ${error.message}`,
    );
  }
}

/**
 * Finds the worker a signup Checkout session belongs to, from the ids we
 * attached ourselves when the session was created — never from anything the
 * customer could have typed.
 */
async function findWorkerForSession(
  supabase: Admin,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const workerId = session.metadata?.worker_id;
  if (workerId) {
    const byId = await supabase.from("workers").select("id").eq("id", workerId).maybeSingle();
    if (byId.data?.id) return byId.data.id as string;
  }

  const authUserId = session.metadata?.auth_user_id;
  if (authUserId) {
    const byAuthUser = await supabase
      .from("workers")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (byAuthUser.data?.id) return byAuthUser.data.id as string;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (customerId) {
    const byCustomer = await supabase
      .from("workers")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer.data?.id) return byCustomer.data.id as string;
  }

  return null;
}

/**
 * A paid one-time signup Checkout session: activate the worker's membership
 * with no expiry, then record the payment.
 *
 * Idempotent: the membership write is "set to active" (not an increment) and
 * the ledger row is keyed by the Checkout session, so Stripe redelivering the
 * event, or the success screen re-reading the session while the webhook is
 * also running, converges on the same row.
 */
export async function applySignupCheckout(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // `checkout.session.completed` arrives before a delayed payment method has
  // settled; `checkout.session.async_payment_succeeded` comes back through
  // here with `paid`. Nothing is activated until Stripe says paid — or says
  // there was nothing to pay (`no_payment_required`), which is what a 100%
  // promotion code produces on a completed session.
  const settled =
    session.payment_status === "paid" ||
    (session.payment_status === "no_payment_required" && session.status === "complete");
  if (!settled) {
    return { matched: false as const, reason: `payment_status:${session.payment_status}` };
  }

  const workerId = await findWorkerForSession(supabase, session);
  if (!workerId) {
    console.warn(`[stripe] Signup session ${session.id} could not be matched to a worker.`);
    return { matched: false as const, reason: "no_worker" };
  }

  const amountCents = session.amount_total ?? 0;
  const expectedCents = Math.round(WORKER_SIGNUP_FEE * 100);
  // A promotion code can legitimately lower the amount; anything else is
  // made loud but still honoured — the worker really was charged.
  if (amountCents !== expectedCents) {
    console.warn(
      `[stripe] Signup fee for worker ${workerId}: charged ${amountCents} cents, list price ${expectedCents}.`,
    );
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // 1. Access — written first, so a ledger problem can never leave a worker
  //    who has paid locked out.
  const { data: current } = await supabase
    .from("workers")
    .select("membership_status,membership_started_at,stripe_customer_id")
    .eq("id", workerId)
    .maybeSingle();

  const row = current as {
    membership_status: string | null;
    membership_started_at: string | null;
    stripe_customer_id: string | null;
  } | null;

  const { error: accessError } = await supabase
    .from("workers")
    .update({
      membership_status: "active",
      // A replay keeps the original start; a fresh (or re-)activation starts now.
      membership_started_at:
        row?.membership_status === "active" && row.membership_started_at
          ? row.membership_started_at
          : now,
      // Paid once: no period end and nothing to renew.
      membership_expires_at: null,
      membership_cancel_at_period_end: false,
      stripe_customer_id: customerId ?? row?.stripe_customer_id ?? null,
      membership_updated_at: now,
      // `stripe_subscription_id` is deliberately left alone: an older
      // $18/year subscription on this worker stays on record, untouched.
    })
    .eq("id", workerId);

  if (accessError) throw new Error(`Could not activate membership: ${accessError.message}`);

  // 2. The payment record. A replay (webhook redelivery, or the worker
  //    reloading the success URL later) must not move `paid_at`: the first
  //    time this session was seen paid is the date that stays.
  const { data: priorRow } = await supabase
    .from(SIGNUP_LEDGER)
    .select("status,paid_at")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  const prior = priorRow as { status: string; paid_at: string | null } | null;
  const paidAt = prior?.status === "paid" && prior.paid_at ? prior.paid_at : now;

  const { error: ledgerError } = await supabase.from(SIGNUP_LEDGER).upsert(
    {
      worker_id: workerId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_customer_id: customerId,
      amount_cents: amountCents,
      currency: session.currency ?? "usd",
      status: "paid",
      paid_at: paidAt,
      updated_at: now,
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  if (ledgerError) {
    if (isMissingLedger(ledgerError)) {
      console.error(
        `[stripe] Signup fee for worker ${workerId} activated but NOT recorded: migration 0013 has not been applied.`,
      );
    } else {
      // Access is already granted; throwing makes Stripe retry the ledger write.
      throw new Error(`Could not record the signup payment: ${ledgerError.message}`);
    }
  }

  console.info(`[stripe] Worker ${workerId} paid the signup fee (${amountCents} cents).`);
  return { matched: true as const, workerId, status: "active" as const };
}

/**
 * `checkout.session.expired` / `checkout.session.async_payment_failed` for a
 * signup session. Nothing was activated, so only the ledger row changes.
 */
export async function applySignupCheckoutFailed(
  session: Stripe.Checkout.Session,
  status: "failed" | "canceled" = "canceled",
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from(SIGNUP_LEDGER)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");

  if (error && !isMissingLedger(error)) {
    console.error("[stripe] Could not mark the signup payment as failed:", error.message);
  }
}

/* ------------------------------------------------------------------ *
 * Worker membership — legacy $18/year subscriptions
 *
 * Nothing new is created on this path any more (Checkout now runs in
 * payment mode), but the subscriptions that already exist keep renewing,
 * failing and cancelling through Stripe, and these handlers keep following
 * them. Existing subscriptions are never cancelled or modified from here.
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

  // A worker who has paid the one-time signup fee owns their access outright.
  // Keep the subscription reference current, but never let this subscription's
  // state (a cancellation, a failed renewal) overwrite that access.
  if (await hasPaidSignupFee(supabase, workerId)) {
    const { error } = await supabase
      .from("workers")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        membership_cancel_at_period_end: false,
        membership_updated_at: new Date().toISOString(),
      })
      .eq("id", workerId);

    if (error) throw new Error(`Could not update membership: ${error.message}`);
    console.info(
      `[stripe] Subscription ${subscription.id} is ${subscription.status}; worker ${workerId} keeps access from their one-time signup fee.`,
    );
    return { matched: true as const, workerId, status: "active" as const };
  }

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

  // The one-time signup fee outlives any subscription: see applySubscription.
  if (await hasPaidSignupFee(supabase, workerId)) {
    await supabase
      .from("workers")
      .update({ membership_cancel_at_period_end: false, membership_updated_at: new Date().toISOString() })
      .eq("id", workerId);
    return { matched: true as const, workerId };
  }

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
 * A completed membership Checkout session.
 *
 * Since the move to the one-time signup fee, every session this app creates
 * is `mode: "payment"` and goes to `applySignupCheckout`. The subscription
 * branch below is kept for sessions created before that change (a worker who
 * finished an old `subscription` Checkout after the deploy) — it re-reads the
 * subscription from Stripe rather than trusting the session payload alone.
 */
export async function applyMembershipCheckout(session: Stripe.Checkout.Session) {
  if (session.mode === "payment") return applySignupCheckout(session);

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
