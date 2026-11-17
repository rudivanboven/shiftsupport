export type WorkerSignupMode = "free" | "paid";
export type WorkerAccessStatus = "inactive" | "active" | "past_due" | "canceled";

/** Missing or invalid configuration defaults to the safer free-access mode. */
export function resolveWorkerSignupMode(value: string | undefined | null): WorkerSignupMode {
  return value?.trim().toLowerCase() === "paid" ? "paid" : "free";
}

export function workerCheckoutEnabled(
  mode: WorkerSignupMode,
  value: string | undefined | null,
): boolean {
  return mode === "paid" && value?.trim() === "true";
}

/** Free mode overrides access only; it never changes stored membership state. */
export function workerHasAccessInMode(
  mode: WorkerSignupMode,
  status: WorkerAccessStatus | string | null | undefined,
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (mode === "free") return true;
  if (status !== "active" && status !== "past_due") return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > now;
}
