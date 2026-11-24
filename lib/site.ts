import { headers } from "next/headers";

export const PRODUCTION_SITE_URL_FALLBACK = "https://shiftsupport.net";

export function isLocalhostOrigin(urlOrHost: string | null | undefined): boolean {
  if (!urlOrHost) return false;
  const clean = urlOrHost.trim().toLowerCase();
  return (
    clean.includes("://localhost") ||
    clean.includes("://127.0.0.1") ||
    clean.includes("://[::1]") ||
    clean.startsWith("localhost") ||
    clean.startsWith("127.0.0.1") ||
    clean.startsWith("[::1]")
  );
}

/**
 * Absolute origin of the running app — used for the redirect links Supabase
 * puts in confirmation / password-reset emails and transactional email templates.
 *
 * Guarantees that Production environments never resolve to a `localhost` URL
 * even if `NEXT_PUBLIC_SITE_URL` is unset or accidentally set to `localhost`.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const isProdEnv =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  if (configured && !isLocalhostOrigin(configured)) {
    return configured;
  }

  let host: string | null = null;
  let proto: string | null = null;
  try {
    const h = await headers();
    host = h.get("x-forwarded-host") ?? h.get("host");
    proto = h.get("x-forwarded-proto");
  } catch {
    // headers() may be unavailable outside a request context
  }

  if (host && !isLocalhostOrigin(host)) {
    const resolvedProto = proto ?? "https";
    return `${resolvedProto}://${host}`.replace(/\/+$/, "");
  }

  const vercelProdHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercelProdHost && !isLocalhostOrigin(vercelProdHost)) {
    const withProto = vercelProdHost.startsWith("http")
      ? vercelProdHost
      : `https://${vercelProdHost}`;
    return withProto.replace(/\/+$/, "");
  }

  if (isProdEnv) {
    return PRODUCTION_SITE_URL_FALLBACK;
  }

  if (configured) {
    return configured;
  }

  const fallbackHost = host ?? "localhost:3000";
  const fallbackProto =
    proto ?? (isLocalhostOrigin(fallbackHost) ? "http" : "https");
  return `${fallbackProto}://${fallbackHost}`.replace(/\/+$/, "");
}
