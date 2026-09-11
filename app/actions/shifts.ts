"use server";

import { revalidatePath } from "next/cache";

import { priceShift, shiftWindow } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { type FieldErrors, type FormState, str } from "@/lib/validation";

/**
 * The retailer's own store id, resolved on the server from the session.
 * The store is never taken from the submitted form — a client cannot post a
 * shift for somebody else's store even if it tampers with the payload.
 */
async function resolveStoreId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." as const };

  const { data } = await supabase
    .from("store_users")
    .select("store_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data?.store_id) return { error: "No store is linked to your account." as const };
  return { storeId: data.store_id as string, userId: user.id };
}

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createShift(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const taskType = str(formData.get("taskType"));
  const description = str(formData.get("description"));
  const shiftLocation = str(formData.get("shiftLocation"));
  const date = str(formData.get("date"));
  const startTime = str(formData.get("startTime"));
  const endTime = str(formData.get("endTime"));
  // Note: any `hourlyRate` in the payload is deliberately not read. The rate a
  // retailer pays is set by the platform, so it comes from `priceShift` below
  // and a tampered form cannot post a shift at some other price.

  const values = { taskType, description, shiftLocation, date, startTime, endTime };
  const fieldErrors: FieldErrors = {};

  if (!taskType) fieldErrors.taskType = "Tell workers what the shift involves.";
  if (!shiftLocation) fieldErrors.shiftLocation = "Enter the location for this shift.";
  if (!date) fieldErrors.date = "Pick a date.";
  else if (!DATE_RE.test(date)) fieldErrors.date = "Enter a valid date.";
  if (!startTime) fieldErrors.startTime = "Pick a start time.";
  else if (!TIME_RE.test(startTime)) fieldErrors.startTime = "Enter a valid time.";
  if (!endTime) fieldErrors.endTime = "Pick an end time.";
  else if (!TIME_RE.test(endTime)) fieldErrors.endTime = "Enter a valid time.";

  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  // Stored as wall-clock times at the store, matching the existing data.
  const start = `${date}T${startTime}:00`;
  const slot = shiftWindow(date, startTime, endTime);

  if (!slot) {
    return { fieldErrors: { endTime: "The shift must be longer than zero hours." }, values };
  }
  if (slot.hours > 24) {
    return { fieldErrors: { endTime: "A single shift can't be longer than 24 hours." }, values };
  }

  const end = `${slot.endDate}T${endTime}:00`;
  const duration = slot.hours;

  // Priced here, from the times the server just validated — never from the
  // browser. `retailerTotal` is what the future payment flow will charge.
  const pricing = priceShift(duration);

  const resolved = await resolveStoreId();
  if ("error" in resolved) return { error: resolved.error, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shifts")
    .insert({
      store_id: resolved.storeId,
      task_type: taskType,
      description: description || null,
      shift_location: shiftLocation,
      start_time: start,
      end_time: end,
      duration,
      hourly_rate: pricing.hourlyRate,
      status: "open",
      created_by: resolved.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createShift]", error);
    return {
      error:
        error.code === "42501"
          ? "You don't have permission to post shifts for this store."
          : "We couldn't post that shift. Please try again.",
      values,
    };
  }

  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");

  return { success: (data as { id: string }).id };
}

export async function cancelShift(shiftId: string) {
  const supabase = await createClient();

  const { data: shift } = await supabase
    .from("shifts")
    .select("id,status,accepted_by")
    .eq("id", shiftId)
    .maybeSingle();

  if (!shift) return { ok: false as const, error: "That shift no longer exists." };
  if (shift.status === "cancelled") {
    return { ok: false as const, error: "That shift is already cancelled." };
  }

  // RLS restricts this update to members of the shift's store.
  const { error } = await supabase
    .from("shifts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", shiftId);

  if (error) {
    console.error("[cancelShift]", error);
    return { ok: false as const, error: "We couldn't cancel that shift." };
  }

  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");
  revalidatePath("/retailer/applicants");
  return { ok: true as const };
}

export async function reopenShift(shiftId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("shifts")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", shiftId)
    .is("accepted_by", null);

  if (error) {
    console.error("[reopenShift]", error);
    return { ok: false as const, error: "We couldn't reopen that shift." };
  }

  revalidatePath("/retailer/shifts");
  return { ok: true as const };
}
