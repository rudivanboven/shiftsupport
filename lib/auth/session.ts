import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  PublicWorker,
  Store,
  StoreUser,
  UserRole,
} from "@/lib/supabase/types";

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
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});

/**
 * Gate for every /worker/* dashboard route.
 * Anonymous -> worker login. Retailer -> their own dashboard.
 */
export async function requireWorker(): Promise<WorkerAccount> {
  const user = await getUser();
  if (!user) redirect("/worker/login");

  const profile = await getProfile();
  if (!profile) redirect("/worker/login?error=missing_profile");
  if (profile.role !== "worker") redirect(dashboardPathFor(profile.role));

  const supabase = await createClient();
  // `workers` has column-level privileges (phone/email are protected), so the
  // readable columns are listed explicitly rather than using `*`.
  const { data: worker } = await supabase
    .from("workers")
    .select("id,auth_user_id,memberstack_id,full_name,created_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!worker) redirect("/worker/login?error=missing_worker");

  return { user, profile, worker: worker as PublicWorker };
}

/**
 * Gate for every /retailer/* dashboard route.
 * Anonymous -> retailer login. Worker -> their own dashboard.
 */
export async function requireRetailer(): Promise<RetailerAccount> {
  const user = await getUser();
  if (!user) redirect("/retailer/login");

  const profile = await getProfile();
  if (!profile) redirect("/retailer/login?error=missing_profile");
  if (profile.role !== "retailer") redirect(dashboardPathFor(profile.role));

  const supabase = await createClient();
  const { data: storeUser } = await supabase
    .from("store_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!storeUser) redirect("/retailer/login?error=missing_store");

  // contact_phone is column-protected, so the store is read through the
  // SECURITY DEFINER function that only returns the caller's own store.
  const { data: stores } = await supabase.rpc("get_my_store");
  const store = (stores as Store[] | null)?.[0];

  if (!store) redirect("/retailer/login?error=missing_store");

  return { user, profile, storeUser: storeUser as StoreUser, store };
}
