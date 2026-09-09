"use client";

import { createBrowserClient } from "@supabase/ssr";
/**
 * Browser Supabase client — anon key only.
 * Reads/writes the auth cookie so the session is shared with the server.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
