import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES Row Level Security.
 *
 * `import "server-only"` above makes the build fail if this file is ever
 * pulled into a client bundle, so the key can never reach the browser.
 *
 * Only used for signup provisioning: creating the profile / worker /
 * store rows for a brand-new auth user, before that user has a session
 * of their own. Every other operation goes through the RLS-bound clients.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (never with a NEXT_PUBLIC_ prefix).",
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
