"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { priceShift, shiftWindow } from "@/lib/pricing";
import {
  MAX_SERIES_WEEKS,
  normaliseDays,
  occurrenceDates,
  seriesEndDate,
} from "@/lib/recurrence";
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
  // A recurring series has its own path; everything below is the one-time
  // shift exactly as it has always worked.
  if (str(formData.get("shiftType")) === "recurring") {
    return createRecurringShift(formData);
  }

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
  // Created as a draft: a shift is not a marketplace shift until it has been
  // paid for. The database enforces the same thing — the insert trigger in
  // migration 0007 pins a session-created shift to `draft` / `unpaid`.
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
      status: "draft",
      payment_status: "unpaid",
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

  const shiftId = (data as { id: string }).id;

  // Take the retailer to the payment review page, but do not create or open a
  // Stripe Checkout session here. Checkout starts only from that page's
  // explicit "Continue to payment" button.
  redirect(`/retailer/shifts/${shiftId}/payment`);
}

/**
 * Creates a recurring series and its dates.
 *
 * The series row holds the schedule; each date is an ordinary shift, created
 * as a draft exactly like a one-time shift (same pricing, same triggers, same
 * RLS) and paid for and published on its own through the existing per-shift
 * checkout. Nothing here charges, or schedules a charge for, anything.
 */
async function createRecurringShift(formData: FormData): Promise<FormState> {
  const taskType = str(formData.get("taskType"));
  const description = str(formData.get("description"));
  const shiftLocation = str(formData.get("shiftLocation"));
  const date = str(formData.get("date"));
  const startTime = str(formData.get("startTime"));
  const endTime = str(formData.get("endTime"));
  const weeksRaw = str(formData.get("weeks"));
  const days = normaliseDays(formData.getAll("repeatDays").map((v) => String(v)));
  const weeks = Number(weeksRaw);

  const values = {
    shiftType: "recurring",
    taskType,
    description,
    shiftLocation,
    date,
    startTime,
    endTime,
    weeks: weeksRaw,
    repeatDays: days.join(","),
  };
  const fieldErrors: FieldErrors = {};

  if (!taskType) fieldErrors.taskType = "Tell workers what the shift involves.";
  if (!shiftLocation) fieldErrors.shiftLocation = "Enter the location for this shift.";
  if (days.length === 0) fieldErrors.repeatDays = "Pick at least one day to repeat on.";
  if (!date) fieldErrors.date = "Pick the date the series starts.";
  else if (!DATE_RE.test(date)) fieldErrors.date = "Enter a valid date.";
  if (!startTime) fieldErrors.startTime = "Pick a start time.";
  else if (!TIME_RE.test(startTime)) fieldErrors.startTime = "Enter a valid time.";
  if (!endTime) fieldErrors.endTime = "Pick an end time.";
  else if (!TIME_RE.test(endTime)) fieldErrors.endTime = "Enter a valid time.";
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_SERIES_WEEKS) {
    fieldErrors.weeks = `Choose between 1 and ${MAX_SERIES_WEEKS} weeks.`;
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const dates = occurrenceDates(date, days, weeks);
  if (dates.length === 0) {
    return {
      fieldErrors: { repeatDays: "None of the chosen days fall within these weeks." },
      values,
    };
  }

  // Each date is priced from its own window, the same way a one-time shift
  // is — so the hours stored, and later charged, are the server's.
  const occurrences = [];
  for (const day of dates) {
    const slot = shiftWindow(day, startTime, endTime);
    if (!slot) {
      return { fieldErrors: { endTime: "The shift must be longer than zero hours." }, values };
    }
    if (slot.hours > 24) {
      return { fieldErrors: { endTime: "A single shift can't be longer than 24 hours." }, values };
    }
    occurrences.push({ day, slot });
  }

  const resolved = await resolveStoreId();
  if ("error" in resolved) return { error: resolved.error, values };

  const supabase = await createClient();

  const { data: series, error: seriesError } = await supabase
    .from("shift_series")
    .insert({
      store_id: resolved.storeId,
      task_type: taskType,
      description: description || null,
      shift_location: shiftLocation,
      days_of_week: days,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      starts_on: date,
      ends_on: seriesEndDate(date, weeks),
      created_by: resolved.userId,
    })
    .select("id")
    .single();

  if (seriesError || !series) {
    console.error("[createRecurringShift] series", seriesError);
    return {
      error:
        seriesError?.code === "42501"
          ? "You don't have permission to post shifts for this store."
          : seriesError?.code === "42P01" || seriesError?.code === "PGRST205"
            ? "Recurring shifts aren't available yet. Please post a one-time shift for now."
            : "We couldn't create that recurring shift. Please try again.",
      values,
    };
  }

  const seriesId = (series as { id: string }).id;

  // Drafts, like every new shift: the payment trigger from migration 0007
  // pins a session-created shift to `draft` / `unpaid` regardless.
  const { error: shiftsError } = await supabase.from("shifts").insert(
    occurrences.map(({ day, slot }) => ({
      store_id: resolved.storeId,
      task_type: taskType,
      description: description || null,
      shift_location: shiftLocation,
      start_time: `${day}T${startTime}:00`,
      end_time: `${slot.endDate}T${endTime}:00`,
      duration: slot.hours,
      hourly_rate: priceShift(slot.hours).hourlyRate,
      status: "draft",
      payment_status: "unpaid",
      created_by: resolved.userId,
      series_id: seriesId,
      occurrence_date: day,
    })),
  );

  if (shiftsError) {
    console.error("[createRecurringShift] occurrences", shiftsError);
    // The batch insert is atomic, so no dates exist; retire the empty series.
    await supabase
      .from("shift_series")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", seriesId);
    return { error: "We couldn't create that recurring shift. Please try again.", values };
  }

  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");

  // The series page lists every date with its own "Pay & publish" button. No
  // Checkout session is created here.
  redirect(`/retailer/shifts/series/${seriesId}`);
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
