import "server-only";

/**
 * The worker signup Checkout kill-switch.
 *
 * `import "server-only"` makes the build fail if this module is ever pulled
 * into a client bundle: the decision reads server environment variables
 * (including the mode of STRIPE_SECRET_KEY) and none of that belongs in the
 * browser. The two callers are both server-side — the Pricing page (a server
 * component, which passes the result to the button as a boolean prop) and the
 * `startMembershipCheckout` server action, which re-checks it so a hand-made
 * request cannot open a session while the button is withheld.
 *
 * The flow is OFF unless `WORKER_SIGNUP_CHECKOUT_ENABLED` is exactly `"true"`:
 *   - missing, empty, "1", "yes", "TRUE" → off;
 *   - set in `.env.local` → on for local QA only, never committed (`.env*` is
 *     git-ignored);
 *   - set in Vercel → on for that environment. Production stays off until the
 *     variable is added there deliberately.
 *
 * It also fails closed on the one mistake that would turn a local test into a
 * real charge: a LIVE secret key anywhere other than Vercel production. Live
 * keys belong only to the production deployment, where `VERCEL_ENV` is
 * "production"; a local `next dev`, a `next start`, or a preview deployment
 * with a live key keeps the button off and says why in the server log.
 */
export function isWorkerSignupCheckoutEnabled(): boolean {
  if (process.env.WORKER_SIGNUP_CHECKOUT_ENABLED?.trim() !== "true") return false;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (secretKey.startsWith("sk_live_") && process.env.VERCEL_ENV !== "production") {
    console.error(
      "[billing] WORKER_SIGNUP_CHECKOUT_ENABLED is true but STRIPE_SECRET_KEY is a LIVE key " +
        "outside Vercel production. Worker signup checkout stays disabled — use an sk_test_ key for QA.",
    );
    return false;
  }

  return true;
}
