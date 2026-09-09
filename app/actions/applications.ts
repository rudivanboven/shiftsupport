"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/* ------------------------------------------------------------------ *
 * Worker: apply for a shift
 *
 * The duplicate / already-filled / no-longer-open rules are all enforced in
 * the database as well — by the unique (shift_id, worker_id) index and by the
 * INSERT policy on shift_applications. The checks here exist to produce a
 * friendly message, not to provide the security.
 * ------------------------------------------------------------------ */

export async function applyForShift(shiftId: string): Promise<Result> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You need to be logged in to apply.");

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!worker) return fail("We couldn't find your worker profile.");

  const { data: shift } = await supabase
    .from("shifts")
    .select("id,status,accepted_by")
    .eq("id", shiftId)
    .maybeSingle();

  if (!shift) return fail("That shift is no longer available.");
  if (shift.accepted_by) return fail("Someone has already been hired for this shift.");
  if (shift.status !== "open") return fail("This shift is no longer open for applications.");

  const { error } = await supabase.from("shift_applications").insert({
    shift_id: shiftId,
    worker_id: worker.id,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") return fail("You've already applied for this shift.");
    console.error("[applyForShift]", error);
    return fail("We couldn't send your application. Please try again.");
  }

  revalidatePath("/worker/available-shifts");
  revalidatePath("/worker/my-shifts");
  revalidatePath("/worker/dashboard");
  return { ok: true };
}

export async function withdrawApplication(applicationId: string): Promise<Result> {
  const supabase = await createClient();

  // The DELETE policy only allows a worker to remove their own pending row.
  const { error } = await supabase
    .from("shift_applications")
    .delete()
    .eq("id", applicationId);

  if (error) {
    console.error("[withdrawApplication]", error);
    return fail("We couldn't withdraw that application.");
  }

  revalidatePath("/worker/my-shifts");
  revalidatePath("/worker/available-shifts");
  revalidatePath("/worker/dashboard");
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Retailer: hire / reject
 *
 * Both go through SECURITY DEFINER database functions that lock the shift
 * row, re-check that the caller owns the store, and update the shift plus
 * every application in one transaction. Two simultaneous "Hire" clicks
 * cannot both succeed.
 * ------------------------------------------------------------------ */

export async function hireApplicant(applicationId: string): Promise<Result> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("hire_applicant", {
    p_application_id: applicationId,
  });

  if (error) {
    console.error("[hireApplicant]", error);
    return fail(cleanRpcMessage(error.message, "We couldn't complete the hire."));
  }

  revalidateRetailer();
  revalidatePath("/worker/my-shifts");
  return { ok: true };
}

export async function rejectApplicant(
  applicationId: string,
  reason?: string,
): Promise<Result> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("reject_application", {
    p_application_id: applicationId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });

  if (error) {
    console.error("[rejectApplicant]", error);
    return fail(cleanRpcMessage(error.message, "We couldn't update that application."));
  }

  revalidateRetailer();
  revalidatePath("/worker/my-shifts");
  return { ok: true };
}

function revalidateRetailer() {
  revalidatePath("/retailer/applicants");
  revalidatePath("/retailer/shifts");
  revalidatePath("/retailer/dashboard");
}

/** Postgres RAISE messages are already user-facing; anything else is not. */
function cleanRpcMessage(message: string, fallback: string) {
  return message && message.length < 160 && !message.includes("relation")
    ? message
    : fallback;
}
