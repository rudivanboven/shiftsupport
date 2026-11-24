import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { reconcileUserAccountServer } from "@/lib/auth/reconcile-server";
import type {
  Profile,
  PublicWorker,
  Store,
  StoreUser,
  UserRole,
} from "@/lib/supabase/types";

/**
 * The one shape every part of the app uses to answer "who is signed in and
 * what are they allowed to see". Produced only by `getCurrentUserWithRole`.
 */
export interface CurrentAccount {
  user: User;
  /** Always read from the `profiles` table — never from the URL or the client. */
  role: UserRole | null;
  profile: Profile | null;
  /** Where this account belongs. `null` while the role is unknown. */
  dashboardPath: string | null;
}

export interface WorkerAccount {
  user: User;
  profile: Profile;
  worker: PublicWorker;
}

export interface RetailerAccount {
  user: User;
  profile: Profile;
  storeUser: StoreUser;
  store: Store;
}

export const dashboardPathFor = (role: UserRole | null | undefined) =>
  role === "retailer" ? "/retailer/dashboard" : "/worker/dashboard";

export const loginPathFor = (role: UserRole) =>
  role === "retailer" ? "/retailer/login" : "/worker/login";

export const roleLabelFor = (role: UserRole | null | undefined) =>
  role === "retailer" ? "Retailer" : role === "admin" ? "Admin" : "Worker";

/**
 * How to greet someone: their real profile name, falling back to the part of
 * their email before the "@" when the profile has no name yet.
 */
export function displayNameFor(account: {
  profile?: { full_name?: string | null } | null;
  user: { email?: string | null };
}) {
  const fullName = account.profile?.full_name?.trim();
  if (fullName) return fullName;

  const email = account.user.email ?? "";
  const prefix = email.split("@")[0]?.trim();
  return prefix || "there";
}

/**
 * The signed-in auth user, validated against the Supabase auth server.
 * `cache()` keeps it to one round-trip per request.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/**
 * The user's role, read from the `profiles` table — never from client state
 * and never from a value the user is able to edit.
 *
 * If an authenticated user's profile row is missing or drifted from their
 * provisioned worker/store_users/auth metadata records, reconciles it on the
 * server so an existing user is never treated as unprovisioned.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getProfile] RLS profile query failed, attempting server reconciliation:", error.message);
  }

  const existing = (data as Profile | null) ?? null;
  if (existing && existing.role) {
    return existing;
  }

  try {
    const reconciled = await reconcileUserAccountServer(user);
    return reconciled.profile ?? existing;
  } catch (reconcileError) {
    if (error) {
      throw new Error(`Unable to load your account profile: ${error.message}`);
    }
    console.error("[getProfile] Account reconciliation failed:", reconcileError);
    return existing;
  }
});

/**
 * THE role resolver. Every session/role decision in the app goes through this
 * one function, so a page can never invent its own idea of who the user is.
 *
 * `cache()` de-duplicates it per request, so calling it from a layout, a page
 * and a component costs a single lookup.
 */
export const getCurrentUserWithRole = cache(
  async (): Promise<CurrentAccount | null> => {
    const user = await getUser();
    if (!user) return null;

    const profile = await getProfile();
    const role = profile?.role ?? null;

    return {
      user,
      role,
      profile,
      dashboardPath: role ? dashboardPathFor(role) : null,
    };
  },
);

/**
 * Same resolver, but a database hiccup returns "signed out" instead of
 * throwing. Only for public marketing pages, where a failed profile lookup
 * must not take the whole page down — never for an access decision.
 */
export async function getCurrentUserWithRoleSafe(): Promise<CurrentAccount | null> {
  try {
    return await getCurrentUserWithRole();
  } catch (error) {
    // `redirect()`, `notFound()` and the "this route reads cookies, render it
    // dynamically" signal are all thrown errors that Next.js has to receive.
    // Swallowing them would break rendering, so only real failures stop here.
    if (isFrameworkSignal(error)) throw error;

    console.error(
      "[auth] Could not resolve the current account:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

function isFrameworkSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")
  );
}

/**
 * Guard for the login and signup pages: a signed-in user is sent to the
 * dashboard their *profile role* points at, whichever door they walked through.
 *
 * `skip` is passed when the login page is showing an account problem
 * (`?error=missing_worker`), which is the one case where bouncing them back to
 * the dashboard would be a redirect loop.
 */
export async function redirectIfSignedIn(options: { skip?: boolean } = {}) {
  if (options.skip) return;

  const account = await getCurrentUserWithRoleSafe();
  if (account?.dashboardPath) redirect(account.dashboardPath);
}

/**
 * Gate for every /worker/* dashboard route.
 * Anonymous -> worker login. Retailer -> their own dashboard.
 */
export async function requireWorker(): Promise<WorkerAccount> {
  const account = await getCurrentUserWithRole();
  if (!account) redirect("/worker/login");

  const { user } = account;
  let { profile, role } = account;

  if (!profile || !role) {
    try {
      const reconciled = await reconcileUserAccountServer(user);
      profile = reconciled.profile;
      role = reconciled.role;
    } catch (err) {
      console.error("[requireWorker] reconciliation failed:", err);
    }
  }

  if (!profile) redirect("/worker/login?error=missing_profile");
  // A retailer never renders a worker page — they go to their own dashboard.
  if (role !== "worker") redirect(account.dashboardPath ?? dashboardPathFor(role));

  const supabase = await createClient();
  // `workers` has column-level privileges (phone/email are protected), so the
  // readable columns are listed explicitly rather than using `*`.
  let { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("id,auth_user_id,memberstack_id,full_name,created_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (workerError) {
    throw new Error(`Unable to load your worker account: ${workerError.message}`);
  }

  if (!worker) {
    try {
      const reconciled = await reconcileUserAccountServer(user);
      worker = reconciled.worker;
    } catch (err) {
      console.error("[requireWorker] worker repair failed:", err);
    }
  }

  if (!worker) redirect("/worker/login?error=missing_worker");

  return { user, profile, worker: worker as PublicWorker };
}

/**
 * Gate for every /retailer/* dashboard route.
 * Anonymous -> retailer login. Worker -> their own dashboard.
 */
export async function requireRetailer(): Promise<RetailerAccount> {
  const account = await getCurrentUserWithRole();
  if (!account) redirect("/retailer/login");

  const { user } = account;
  let { profile, role } = account;

  if (!profile || !role) {
    try {
      const reconciled = await reconcileUserAccountServer(user);
      profile = reconciled.profile;
      role = reconciled.role;
    } catch (err) {
      console.error("[requireRetailer] reconciliation failed:", err);
    }
  }

  if (!profile) redirect("/retailer/login?error=missing_profile");
  // A worker never renders a retailer page — they go to their own dashboard.
  if (role !== "retailer") redirect(account.dashboardPath ?? dashboardPathFor(role));

  const supabase = await createClient();
  let { data: storeUser, error: storeUserError } = await supabase
    .from("store_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (storeUserError) {
    throw new Error(`Unable to load your retailer account: ${storeUserError.message}`);
  }

  if (!storeUser) {
    try {
      const reconciled = await reconcileUserAccountServer(user);
      storeUser = reconciled.storeUser;
    } catch (err) {
      console.error("[requireRetailer] store_users repair failed:", err);
    }
  }

  if (!storeUser) redirect("/retailer/login?error=missing_store");

  // contact_phone is column-protected, so the store is read through the
  // SECURITY DEFINER function that only returns the caller's own store.
  const { data: stores, error: storeError } = await supabase.rpc("get_my_store");
  if (storeError) {
    throw new Error(`Unable to load your store: ${storeError.message}`);
  }
  let store = (stores as Store[] | null)?.[0] ?? null;

  if (!store) {
    try {
      const reconciled = await reconcileUserAccountServer(user);
      store = reconciled.store;
    } catch (err) {
      console.error("[requireRetailer] store repair failed:", err);
    }
  }

  if (!store) redirect("/retailer/login?error=missing_store");

  return { user, profile, storeUser: storeUser as StoreUser, store };
}
