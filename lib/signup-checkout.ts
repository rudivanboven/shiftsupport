import "server-only";

import { resolveWorkerSignupMode, workerCheckoutEnabled } from "@/lib/worker-access";

/** Server-controlled access mode. Missing configuration keeps worker access free. */
export function isWorkerSignupFreeMode(): boolean {
  return resolveWorkerSignupMode(process.env.WORKER_SIGNUP_MODE) === "free";
}

/** Existing $18/year Checkout is opt-in only in explicitly configured paid mode. */
export function isWorkerSignupCheckoutEnabled(): boolean {
  return workerCheckoutEnabled(
    resolveWorkerSignupMode(process.env.WORKER_SIGNUP_MODE),
    process.env.WORKER_SIGNUP_CHECKOUT_ENABLED,
  );
}
