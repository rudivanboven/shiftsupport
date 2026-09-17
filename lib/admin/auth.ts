import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Super Admin authorisation for the Operations Control Center.
 *
 * Membership lives in `public.super_admins` (migration 0010), never in
 * `profiles.role`, so no worker/retailer signup path can produce it. The
 * lookup below runs through the caller's own RLS-bound session: the SELECT
 * policy on `super_admins` only returns rows to an active Super Admin, so a
 * worker or retailer gets nothing back no matter what they send.
 *
 * Fails closed — a missing table, a network error, anything unexpected means
 * "not a Super Admin".
 */

export interface SuperAdminAccount {
  user: User;
  email: string;
  fullName: string | null;
  isPrimary: boolean;
  grantedAt: string;
}

export const getSuperAdmin = cache(async (): Promise<SuperAdminAccount | null> => {
  const user = await getUser();
  if (!user) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("super_admins")
      .select("user_id,email,full_name,is_primary,status,granted_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.error("[super-admin] Access lookup failed:", error.message);
      return null;
    }
    if (!data) return null;

    return {
      user,
      email: (data.email as string | null) ?? user.email ?? "",
      fullName: (data.full_name as string | null) ?? null,
      isPrimary: Boolean(data.is_primary),
      grantedAt: data.granted_at as string,
    };
  } catch (error) {
    console.error(
      "[super-admin] Access lookup threw:",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }
});

/**
 * Gate for every Super Admin page and layout.
 * Signed out -> Super Admin login. Signed in without access -> 404, so the
 * console does not confirm it exists to a worker or retailer who guesses the URL.
 */
export async function requireSuperAdmin(): Promise<SuperAdminAccount> {
  const user = await getUser();
  if (!user) redirect("/super-admin/login");

  const admin = await getSuperAdmin();
  if (!admin) notFound();

  return admin;
}

export class NotAuthorisedError extends Error {
  constructor() {
    super("Not authorised.");
    this.name = "NotAuthorisedError";
  }
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertSuperAdmin(): Promise<SuperAdminAccount> {
  const admin = await getSuperAdmin();
  if (!admin) throw new NotAuthorisedError();
  return admin;
}

/**
 * The ONLY way the admin data layer obtains a service-role client. It
 * re-authorises the caller first, so a data function imported somewhere it
 * should not be still refuses to run for anyone but a Super Admin.
 */
export async function adminDb() {
  await assertSuperAdmin();
  return createAdminClient();
}
