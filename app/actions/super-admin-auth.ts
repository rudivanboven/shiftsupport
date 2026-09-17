"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { type FieldErrors, type FormState, str, validateEmail } from "@/lib/validation";

const NO_ACCESS = "This account does not have access to the Operations Control Center.";

/**
 * Sign-in for the Operations Control Center. Same Supabase Auth as the rest of
 * the app — there is no separate credential store. After the password check,
 * access is decided by `is_super_admin()` in the database; anyone else is
 * signed straight back out of this browser and told nothing more.
 */
export async function signInSuperAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };

  const fieldErrors: FieldErrors = {};
  validateEmail(email, fieldErrors);
  if (!password) fieldErrors.password = "Password is required.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("rate limit") || message.includes("too many")) {
      return { error: "Too many attempts. Please wait a little and try again.", values };
    }
    return { error: "That email and password combination doesn't match an account.", values };
  }

  const { data: isAdmin, error: accessError } = await supabase.rpc("is_super_admin");

  if (accessError || isAdmin !== true) {
    if (accessError) console.error("[super-admin] is_super_admin failed at sign-in:", accessError.message);
    await supabase.auth.signOut({ scope: "local" });
    return { error: NO_ACCESS, values };
  }

  revalidatePath("/super-admin", "layout");
  redirect("/super-admin");
}
