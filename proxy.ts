import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed Middleware to Proxy. Proxy runs on the Node.js runtime,
 * which is the supported routing boundary for the Supabase SSR client.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // `api/stripe/` is excluded on purpose: the Stripe webhook authenticates
    // itself with a signature, carries no Supabase session, and must not wait
    // on (or be affected by) a session refresh.
    "/((?!_next/|api/stripe/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|eot)$).*)",
  ],
};
