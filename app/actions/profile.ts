"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import {
  type FieldErrors,
  type FormState,
  str,
  validateEmail,
  validatePhone,
  validateRequired,
} from "@/lib/validation";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/* ------------------------------------------------------------------ *
 * Personal details (both roles)
 * ------------------------------------------------------------------ */

export async function updateWorkerProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fullName = str(formData.get("fullName"));
  const phone = str(formData.get("phone"));
  const values = { fullName, phone };

  const fieldErrors: FieldErrors = {};
  validateRequired({ fullName: { value: fullName, label: "Full name" } }, fieldErrors);
  validatePhone(phone, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "You need to be logged in.", values };

  const now = new Date().toISOString();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, updated_at: now })
    .eq("id", user.id);

  if (profileError) {
    console.error("[updateWorkerProfile] profiles", profileError);
    return { error: "We couldn't save your details. Please try again.", values };
  }

  // Keep the worker record in step — it's what retailers see once you're hired.
  const { error: workerError } = await supabase
    .from("workers")
    .update({ full_name: fullName, phone, updated_at: now })
    .eq("auth_user_id", user.id);

  if (workerError) {
    console.error("[updateWorkerProfile] workers", workerError);
    return { error: "We couldn't save your details. Please try again.", values };
  }

  revalidatePath("/worker", "layout");
  return { success: "Your details have been saved." };
}

export async function updateRetailerProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fullName = str(formData.get("fullName"));
  const phone = str(formData.get("phone"));
  const values = { fullName, phone };

  const fieldErrors: FieldErrors = {};
  validateRequired({ fullName: { value: fullName, label: "Full name" } }, fieldErrors);
  validatePhone(phone, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "You need to be logged in.", values };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("[updateRetailerProfile]", error);
    return { error: "We couldn't save your details. Please try again.", values };
  }

  revalidatePath("/retailer", "layout");
  return { success: "Your details have been saved." };
}

/* ------------------------------------------------------------------ *
 * Store details (retailer only)
 * ------------------------------------------------------------------ */

export async function updateStore(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = str(formData.get("storeName"));
  const address = str(formData.get("storeAddress"));
  const contactPhone = str(formData.get("storePhone"));
  const values = { storeName: name, storeAddress: address, storePhone: contactPhone };

  const fieldErrors: FieldErrors = {};
  validateRequired(
    {
      storeName: { value: name, label: "Store name" },
      storeAddress: { value: address, label: "Store address" },
    },
    fieldErrors,
  );
  validatePhone(contactPhone, fieldErrors, "storePhone");
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "You need to be logged in.", values };

  const { data: link } = await supabase
    .from("store_users")
    .select("store_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!link?.store_id) return { error: "No store is linked to your account.", values };

  // The UPDATE policy on `stores` restricts this to members of that store.
  const { error } = await supabase
    .from("stores")
    .update({
      name,
      address,
      contact_phone: contactPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", link.store_id);

  if (error) {
    console.error("[updateStore]", error);
    return { error: "We couldn't save your store details. Please try again.", values };
  }

  revalidatePath("/retailer", "layout");
  return { success: "Your store details have been saved." };
}

/* ------------------------------------------------------------------ *
 * Email address
 *
 * The auth email is the source of truth, so it is changed through Supabase
 * Auth — never by writing to a table. Supabase emails a confirmation link to
 * the NEW address; the profile copy is synced once that link is followed.
 * ------------------------------------------------------------------ */

export async function updateEmail(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData.get("email")).toLowerCase();
  const values = { email };

  const fieldErrors: FieldErrors = {};
  validateEmail(email, fieldErrors);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "You need to be logged in.", values };

  if (user.email?.toLowerCase() === email) {
    return { error: "That's already your email address.", values };
  }

  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl}/auth/callback?next=/` },
  );

  if (error) return { error: error.message, values };

  return {
    success: `We've sent a confirmation link to ${email}. Your address changes once you follow it.`,
  };
}

/**
 * Copies the confirmed auth email into the profile row when they differ.
 * Called from the settings pages so the two never drift apart.
 */
export async function syncProfileEmail() {
  const { supabase, user } = await currentUser();
  if (!user?.email) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.email === user.email) return;

  await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);

  if (profile.role === "worker") {
    await supabase.from("workers").update({ email: user.email }).eq("auth_user_id", user.id);
  } else {
    await supabase
      .from("store_users")
      .update({ email: user.email })
      .eq("auth_user_id", user.id);
  }
}

/* ------------------------------------------------------------------ *
 * Password (while signed in)
 * ------------------------------------------------------------------ */

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: FieldErrors = {};
  if (!password) fieldErrors.password = "Enter a new password.";
  else if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "You need to be logged in." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { success: "Your password has been updated." };
}
