import "server-only";

import Stripe from "stripe";

/**
 * The server-side Stripe client.
 *
 * `import "server-only"` makes the build fail if this file is ever pulled into
 * a client bundle, so STRIPE_SECRET_KEY can never reach a browser. Nothing in
 * this module reads a key, price or amount from a request.
 */

let cached: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Stripe is not configured. Missing: ${missing.join(", ")}.`);
    this.name = "StripeNotConfiguredError";
  }
}

/** Which of the Stripe environment variables are missing, if any. */
export function missingStripeEnv(
  keys: readonly (keyof typeof STRIPE_ENV)[] = ["STRIPE_SECRET_KEY"],
): string[] {
  return keys.filter((key) => !process.env[key]?.trim());
}

const STRIPE_ENV = {
  STRIPE_SECRET_KEY: true,
  STRIPE_WEBHOOK_SECRET: true,
  STRIPE_WORKER_MEMBERSHIP_PRICE_ID: true,
} as const;

export const isStripeConfigured = () => missingStripeEnv().length === 0;

export function getStripe(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new StripeNotConfiguredError(["STRIPE_SECRET_KEY"]);

  // Loud in the server log, but never a hard failure: which mode the keys are
  // in is the operator's decision, not something the app should silently flip.
  if (secretKey.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
    console.warn(
      "[stripe] A LIVE secret key is configured outside production. " +
        "Use test keys (sk_test_…) for QA — live keys create real charges.",
    );
  }

  cached = new Stripe(secretKey, {
    // Pinned so a Stripe-side API change cannot alter the shapes this app
    // reads. Matches the version the installed SDK is generated against.
    apiVersion: "2026-08-26.dahlia",
    appInfo: { name: "ShiftSupport", url: "https://shiftsupport.net" },
    typescript: true,
  });

  return cached;
}

/** The membership price id — only ever read from the server environment. */
export function membershipPriceId(): string {
  const priceId = process.env.STRIPE_WORKER_MEMBERSHIP_PRICE_ID?.trim();
  if (!priceId) throw new StripeNotConfiguredError(["STRIPE_WORKER_MEMBERSHIP_PRICE_ID"]);
  return priceId;
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new StripeNotConfiguredError(["STRIPE_WEBHOOK_SECRET"]);
  return secret;
}

/**
 * Metadata `kind` values. Every Checkout session this app creates carries one,
 * so the webhook can tell a membership subscription from a shift payment
 * without guessing from the line items.
 */
export const CHECKOUT_KIND = {
  workerMembership: "worker_membership",
  retailerShift: "retailer_shift",
} as const;

export type CheckoutKind = (typeof CHECKOUT_KIND)[keyof typeof CHECKOUT_KIND];
