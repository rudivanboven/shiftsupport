/**
 * Operations Control Center settings. Both have safe defaults, so nothing
 * needs configuring for the console to work.
 */

/**
 * IANA time zone that "today", "last 7 days" and every daily chart bucket are
 * counted in. Account/payment timestamps are instants and are converted into
 * this zone; shift start/end times are already store wall-clock times.
 */
export const REPORTING_TIME_ZONE = (() => {
  const configured = process.env.OPERATIONS_TIME_ZONE?.trim();
  if (!configured) return "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: configured });
    return configured;
  } catch {
    console.error(`[super-admin] OPERATIONS_TIME_ZONE "${configured}" is not a valid time zone.`);
    return "America/Los_Angeles";
  }
})();

/** Country calling code assumed for 10-digit phone numbers saved without one. */
export const DEFAULT_PHONE_COUNTRY_CODE =
  process.env.OPERATIONS_DEFAULT_COUNTRY_CODE?.replace(/\D/g, "") || "1";

/** Rows per page on the directory screens. */
export const PAGE_SIZE = 25;
