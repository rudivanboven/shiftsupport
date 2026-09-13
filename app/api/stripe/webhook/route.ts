import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, isStripeConfigured, webhookSecret } from "@/lib/stripe/client";
import {
  applyCheckoutSession,
  applyInvoicePaymentFailed,
  applyShiftCheckoutFailed,
  applySubscription,
  applySubscriptionDeleted,
  claimStripeEvent,
  markStripeEventProcessed,
  releaseStripeEvent,
} from "@/lib/stripe/fulfillment";

/**
 * POST /api/stripe/webhook
 *
 * The authoritative path for every payment fact in the app: memberships are
 * activated here, and shifts are published here. Nothing is believed unless
 * Stripe signed it.
 *
 * Three properties this route has to hold:
 *   1. Signature verified against STRIPE_WEBHOOK_SECRET over the RAW body —
 *      an unsigned or tampered request is rejected before anything is read.
 *   2. Idempotent — Stripe retries, and may deliver the same event more than
 *      once. The event id is claimed in `stripe_events` first; a duplicate
 *      returns 200 without doing the work again.
 *   3. Retryable — a failure releases the claim and answers 500, so Stripe's
 *      own retry schedule gets another chance at it.
 */

// The raw body is required for signature verification, so this route must run
// on Node.js and must never be statically optimised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    console.error("[stripe] Webhook called but Stripe is not configured.");
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // `request.text()` gives the exact bytes Stripe signed. Parsing to JSON first
  // would change the payload and every signature check would fail.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret());
  } catch (error) {
    // Invalid signature, wrong secret, or a replay outside the tolerance window.
    console.warn(
      "[stripe] Rejected an unverified webhook:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Claim the event id before doing any work. A redelivery loses the race and
  // is acknowledged without touching a membership or a shift a second time.
  let claimed: boolean;
  try {
    claimed = await claimStripeEvent(event);
  } catch (error) {
    console.error("[stripe] Could not record event:", error);
    return NextResponse.json({ error: "Event log unavailable." }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await markStripeEventProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[stripe] Failed to handle ${event.type} (${event.id}):`, error);
    // Give the retry a clean slate rather than leaving the id claimed by a
    // run that never finished.
    await releaseStripeEvent(event.id).catch(() => {});
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await applyCheckoutSession(event.data.object as Stripe.Checkout.Session);
      return;
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "retailer_shift") {
        await applyShiftCheckoutFailed(
          session,
          event.type === "checkout.session.expired" ? "canceled" : "failed",
        );
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await applySubscription(event.data.object as Stripe.Subscription);
      return;
    }

    case "customer.subscription.deleted": {
      await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    }

    case "invoice.payment_failed": {
      await applyInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    }

    case "invoice.payment_succeeded":
    case "invoice.paid": {
      // A renewal: re-read the subscription so the new period end is stored.
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string };
      };
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await applySubscription(subscription);
      }
      return;
    }

    default:
      // Everything else is acknowledged and ignored on purpose.
      return;
  }
}
