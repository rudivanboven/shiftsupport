"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import {
  type FieldErrors,
  type FormState,
  str,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRequired,
} from "@/lib/validation";
import type { UserRole } from "@/lib/supabase/types";

const GENERIC_ERROR = "Something went wrong. Please try again.";

function friendlyAuthError(error: { code?: string; message: string }) {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();

  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "Too many email attempts. Please wait a little and try again.";
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "That email and password combination doesn't match an account.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Please confirm your email address before logging in.";
  }

  if (code === "weak_password" || message.includes("password")) {
    return "Please choose a stronger password and try again.";
  }

  return GENERIC_ERROR;
}

/**
 * Only same-site paths may be used as a post-login destination.
 * "//evil.com" also starts with "/", but browsers read it as an absolute URL —
 * so a bare startsWith("/") check would be an open redirect.
 */
const isSafePath = (path: string) =>
  path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");

const dashboardFor = (role: UserRole) =>
  role === "retailer" ? "/retailer/dashboard" : "/worker/dashboard";

/** Stops a `?next=` from dropping a worker into the retailer area, or the reverse. */
const isOtherRoleArea = (path: string, role: UserRole) =>
  role === "retailer" ? path.startsWith("/worker/") : path.startsWith("/retailer/");

/* ------------------------------------------------------------------ *
 * Provisioning
 *
 * Runs with the service-role key on the server only. It creates the
 * database records for a brand-new auth user, which has to happen before
 * that user has a session of their own (email confirmation may be on).
 * Every step is idempotent so a retried signup cannot duplicate rows.
 * ------------------------------------------------------------------ */

async function setRole(userId: string, role: UserRole) {
  const admin = createAdminClient();
  // app_metadata is signed into the JWT and is NOT user-writable —
  // middleware reads it for fast role routing.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (error) throw error;
}

async function provisionWorker(input: {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
}) {
  const admin = createAdminClient();

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: input.userId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      role: "worker",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { data: existing } = await admin
    .from("workers")
    .select("id")
    .eq("auth_user_id", input.userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await admin.from("workers").insert({
      auth_user_id: input.userId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
    });
    if (error) throw error;
  }

  await setRole(input.userId, "worker");
}

async function provisionRetailer(input: {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
}) {
  const admin = createAdminClient();

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: input.userId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      role: "retailer",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const { data: existingLink } = await admin
    .from("store_users")
    .select("id, store_id")
    .eq("auth_user_id", input.userId)
    .maybeSingle();

  if (!existingLink) {
    const { data: store, error: storeError } = await admin
      .from("stores")
      .insert({
        name: input.storeName,
        address: input.storeAddress,
        contact_phone: input.storePhone,
      })
      .select("id")
      .single();
    if (storeError) throw storeError;

    const { error: linkError } = await admin.from("store_users").insert({
      store_id: store!.id,
      auth_user_id: input.userId,
      email: input.email,
      role: "owner",
    });
    if (linkError) throw linkError;
  }

  await setRole(input.userId, "retailer");
}

/* ------------------------------------------------------------------ *
 * Sign up
 * ------------------------------------------------------------------ */

/** Supabase returns a decoy user with no identities when the email is taken. */
const emailAlreadyRegistered = (user: { identities?: unknown[] | null } | null) =>
  Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);

export async function signUpWorker(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fullName = str(formData.get("fullName"));
  const email = str(formData.get("email")).toLowerCase();
  const phone = str(formData.get("phone"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const values = { fullName, email, phone };

  const fieldErrors: FieldErrors = {};
  validateRequired({ fullName: { value: fullName, label: "Full name" } }, fieldErrors);
  validateEmail(email, fieldErrors);
  validatePhone(phone, fieldErrors);
  validatePassword(password, confirmPassword, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, role: "worker" },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/worker/dashboard`,
    },
  });

  if (error) return { error: friendlyAuthError(error), values };
  if (emailAlreadyRegistered(data.user)) {
    return {
      error: "An account with this email already exists. Try logging in instead.",
      values,
    };
  }
  if (!data.user) return { error: GENERIC_ERROR, values };

  try {
    await provisionWorker({ userId: data.user.id, email, fullName, phone });
  } catch (err) {
    console.error("[signUpWorker] provisioning failed", err);
    return { error: "We created your login but could not finish your profile. Please contact support.", values };
  }

  if (!data.session) redirect("/worker/login?confirm=1");

  revalidatePath("/", "layout");
  redirect("/worker/dashboard");
}

export async function signUpRetailer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fullName = str(formData.get("fullName"));
  const email = str(formData.get("email")).toLowerCase();
  const phone = str(formData.get("phone"));
  const storeName = str(formData.get("storeName"));
  const storeAddress = str(formData.get("storeAddress"));
  const storePhone = str(formData.get("storePhone"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const values = { fullName, email, phone, storeName, storeAddress, storePhone };

  const fieldErrors: FieldErrors = {};
  validateRequired(
    {
      fullName: { value: fullName, label: "Full name" },
      storeName: { value: storeName, label: "Store name" },
      storeAddress: { value: storeAddress, label: "Store address" },
    },
    fieldErrors,
  );
  validateEmail(email, fieldErrors);
  validatePhone(phone, fieldErrors);
  validatePhone(storePhone, fieldErrors, "storePhone");
  validatePassword(password, confirmPassword, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, role: "retailer", store_name: storeName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/retailer/dashboard`,
    },
  });

  if (error) return { error: friendlyAuthError(error), values };
  if (emailAlreadyRegistered(data.user)) {
    return {
      error: "An account with this email already exists. Try logging in instead.",
      values,
    };
  }
  if (!data.user) return { error: GENERIC_ERROR, values };

  try {
    await provisionRetailer({
      userId: data.user.id,
      email,
      fullName,
      phone,
      storeName,
      storeAddress,
      storePhone,
    });
  } catch (err) {
    console.error("[signUpRetailer] provisioning failed", err);
    return { error: "We created your login but could not finish setting up your store. Please contact support.", values };
  }

  if (!data.session) redirect("/retailer/login?confirm=1");

  revalidatePath("/", "layout");
  redirect("/retailer/dashboard");
}

/* ------------------------------------------------------------------ *
 * Sign in
 * ------------------------------------------------------------------ */

async function signIn(
  expectedRole: UserRole,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = str(formData.get("next"));
  const values = { email };

  const fieldErrors: FieldErrors = {};
  validateEmail(email, fieldErrors);
  if (!password) fieldErrors.password = "Password is required.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: friendlyAuthError(error), values };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[signIn] profile lookup failed", profileError);
    // Local scope only: this clears the cookie for THIS browser. A global
    // sign-out would revoke the refresh token behind every other session this
    // person has, logging them out of tabs and devices that were working fine.
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: "We couldn't load your account profile. Please try again or contact support.",
      values,
    };
  }

  const role = (profile?.role as UserRole | undefined) ?? null;

  if (!role) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "This account isn't set up yet. Please sign up first.", values };
  }

  // Repair app_metadata if it drifted from the profile role.
  if (data.user.app_metadata?.role !== role) {
    try {
      await setRole(data.user.id, role);
    } catch (err) {
      console.error("[signIn] could not sync role metadata", err);
    }
  }

  revalidatePath("/", "layout");

  const home = dashboardFor(role);

  // Wrong door. The credentials are valid, so keep the session and send them
  // to the dashboard their role actually points at — they are never treated as
  // the other role, and a mistyped door never costs them their session.
  if (role !== expectedRole) redirect(home);

  // Honour ?next= only when it belongs to this account's own area.
  const wanted = isSafePath(next) ? next : "";
  redirect(wanted && !isOtherRoleArea(wanted, role) ? wanted : home);
}

export async function signInWorker(_prev: FormState, formData: FormData) {
  return signIn("worker", formData);
}

export async function signInRetailer(_prev: FormState, formData: FormData) {
  return signIn("retailer", formData);
}

/* ------------------------------------------------------------------ *
 * Sign out
 * ------------------------------------------------------------------ */

/**
 * The single logout path for the whole app — dashboards and the account strips
 * on the public pages all post here, so the session is always torn down the
 * same way. An optional `redirectTo` field decides where the user lands.
 */
export async function signOutAction(formData?: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const requested = formData instanceof FormData ? str(formData.get("redirectTo")) : "";
  const destination = isSafePath(requested) ? requested : "/";

  revalidatePath("/", "layout");
  redirect(destination);
}

/* ------------------------------------------------------------------ *
 * Password reset
 * ------------------------------------------------------------------ */

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData.get("email")).toLowerCase();
  const fieldErrors: FieldErrors = {};
  validateEmail(email, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: { email } };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) console.error("[requestPasswordReset]", error.message);

  // Always the same answer, so this cannot be used to discover which
  // email addresses have accounts.
  return {
    success:
      "If an account exists for that address, a password reset link is on its way.",
  };
}

const EXPIRED_LINK =
  "This reset link has expired or has already been used. Please request a new one.";

/**
 * Sets a new password from a password-reset email.
 *
 * Two ways in, both ending in a Supabase Auth session for the account being
 * recovered:
 *
 *   - `tokenHash` (the branded email template links to
 *     /reset-password?token_hash=…&type=recovery). The one-time token is only
 *     verified HERE, when the user submits — so a mail scanner that "clicks"
 *     the link cannot use it up, and it works on any device or browser.
 *   - An existing session, from the older `/auth/callback?code=…` link.
 *
 * Supabase Auth stores and checks the password; nothing here touches roles,
 * profiles or any other account data.
 */
export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const tokenHash = str(formData.get("tokenHash"));

  const fieldErrors: FieldErrors = {};
  validatePassword(password, confirmPassword, fieldErrors);
  // Validated before the token is verified, so a typo never uses up the link.
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();

  if (tokenHash) {
    // Signs the browser in as the account the link was issued for — replacing
    // any other session it held, so the right account's password changes.
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error) {
      console.error("[updatePassword] verifyOtp:", error.code ?? error.message);
      return { error: EXPIRED_LINK, values: { linkExpired: "1" } };
    }
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: EXPIRED_LINK, values: { linkExpired: "1" } };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // The token (if any) is spent now, but the session it created is valid:
    // the form retries on the session instead of the used token.
    const retry = tokenHash ? { tokenConsumed: "1" } : undefined;
    if (error.code === "same_password") {
      return {
        fieldErrors: { password: "Choose a password you haven't used for this account before." },
        values: retry,
      };
    }
    if (error.code === "weak_password") {
      return {
        fieldErrors: { password: "That password is too weak. Try a longer one with a mix of characters." },
        values: retry,
      };
    }
    console.error("[updatePassword] updateUser:", error.code ?? error.message);
    return {
      error: "We couldn't update your password. Please try again.",
      values: retry,
    };
  }

  // Anyone still signed in with the old password on another device is
  // signed out. Best effort: the password itself is already changed.
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch (signOutError) {
    console.error("[updatePassword] signOut others:", signOutError);
  }

  revalidatePath("/", "layout");
  return {
    success: "Your password has been updated.",
    redirectTo: await continuePathFor(supabase, userData.user.id),
  };
}

/**
 * Where the success screen sends the user. Read-only: it looks at the records
 * signup already created and changes nothing.
 */
async function continuePathFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "retailer") return "/retailer/dashboard";

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (worker) return "/worker/dashboard";

  // Neither a worker nor a retailer — an operations (Super Admin) login, which
  // signs in through its own page and keeps its own authorisation checks.
  const { data: isAdmin } = await supabase.rpc("is_super_admin");
  if (isAdmin === true) return "/super-admin";

  return "/worker/login";
}
