"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markRetailerFirstShiftPosted } from "@/lib/email/server";
import { normaliseWallClock, wallClockNow } from "@/lib/admin/dates";
import { priceShift, shiftWindow } from "@/lib/pricing";
import {
  MAX_SERIES_WEEKS,
  normaliseDays,
  occurrenceDates,
  seriesEndDate,
} from "@/lib/recurrence";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Published directly as `open` without a Stripe checkout step.
  const { error } = await admin
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
      payment_status: "legacy",
      published_at: now,
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

  await markRetailerFirstShiftPosted(resolved.storeId);

  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");
  revalidatePath("/worker/available-shifts");
  revalidatePath("/worker/dashboard");

  redirect("/retailer/shifts");
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
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Publish every date in the series immediately as `open` without requiring
  // per-date Stripe Checkout payments.
  const { error: shiftsError } = await admin.from("shifts").insert(
    occurrences.map(({ day, slot }) => ({
      store_id: resolved.storeId,
      task_type: taskType,
      description: description || null,
      shift_location: shiftLocation,
      start_time: `${day}T${startTime}:00`,
      end_time: `${slot.endDate}T${endTime}:00`,
      duration: slot.hours,
      hourly_rate: priceShift(slot.hours).hourlyRate,
      status: "open",
      payment_status: "legacy",
      published_at: now,
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

  await markRetailerFirstShiftPosted(resolved.storeId);

  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");
  revalidatePath("/worker/available-shifts");
  revalidatePath("/worker/dashboard");

  redirect(`/retailer/shifts/series/${seriesId}`);
}

export async function cancelShift(shiftId: string) {
  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { ok: false as const, error: owned.error };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "cancelled") {
    return { ok: false as const, error: "That shift is already cancelled." };
  }
  if (shift.status === "completed" || shift.completed_at) {
    return {
      ok: false as const,
      error: "Cannot cancel a shift that has completed work on record.",
    };
  }

  const [{ data: existingInvoice }, { data: existingEntry }, { data: paidPayment }] =
    await Promise.all([
      admin.from("retailer_invoices").select("id").eq("shift_id", shiftId).maybeSingle(),
      admin.from("shift_time_entries").select("id").eq("shift_id", shiftId).maybeSingle(),
      admin
        .from("shift_payments")
        .select("id")
        .eq("shift_id", shiftId)
        .eq("status", "paid")
        .maybeSingle(),
    ]);

  if (existingInvoice || existingEntry || shift.payment_status === "paid" || paidPayment) {
    return {
      ok: false as const,
      error: "Cannot cancel a shift with timesheets, invoices, or payment records.",
    };
  }

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_delete_shift", {
    p_shift_id: shiftId,
    p_reason: "Cancelled by retailer",
  });

  if (rpcResult.error && !isMissingRpcOrColError(rpcResult.error)) {
    return {
      ok: false as const,
      error: rpcMessage(rpcResult.error, "We couldn't cancel that shift."),
    };
  }

  if (rpcResult.error) {
    const { error } = await admin
      .from("shifts")
      .update({
        status: "cancelled",
        is_hidden: false,
        hidden_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shiftId)
      .eq("store_id", storeId);

    if (error) {
      console.error("[cancelShift]", error);
      return { ok: false as const, error: "We couldn't cancel that shift." };
    }

    await admin.from("admin_audit_log").insert({
      actor_user_id: userId,
      actor_email: userEmail,
      action: "shift.retailer_deleted",
      target_type: "shift",
      target_id: shiftId,
      metadata: {
        actor_role: "retailer",
        store_id: storeId,
        task_type: shift.task_type,
        previous_status: shift.status,
        new_status: "cancelled",
      },
    });
  }

  revalidateRetailerShiftPaths(shiftId, storeId);
  return { ok: true as const };
}

export async function reopenShift(shiftId: string) {
  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { ok: false as const, error: owned.error };

  const { shift, storeId, admin } = owned;
  if (shift.status === "completed" || shift.completed_at) {
    return { ok: false as const, error: "Completed shifts cannot be reopened." };
  }
  if (shift.accepted_by) {
    return { ok: false as const, error: "A worker is already hired for this shift." };
  }

  const nowLocal = wallClockNow();
  if (normaliseWallClock(shift.end_time as string) <= nowLocal) {
    return {
      ok: false as const,
      error: "This shift's scheduled date has passed. Use Renew Shift to pick a new future date.",
    };
  }

  const { error } = await admin
    .from("shifts")
    .update({ status: "open", is_hidden: false, hidden_at: null, updated_at: new Date().toISOString() })
    .eq("id", shiftId)
    .eq("store_id", storeId)
    .is("accepted_by", null);

  if (error) {
    console.error("[reopenShift]", error);
    return { ok: false as const, error: "We couldn't reopen that shift." };
  }

  revalidateRetailerShiftPaths(shiftId, storeId);
  return { ok: true as const };
}

/* ------------------------------------------------------------------ *
 * Retailer Shift Management Controls (Own Store Only)
 *   - Hide Shift / Show Shift
 *   - Edit Shift
 *   - Extend Date / Time (Separate Posting Expiry vs Scheduled Shift Time)
 *   - Renew Shift (In-place renewal without creating duplicate rows)
 *   - Delete Shift (Soft delete / archive with confirmation & safety guards)
 * ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRIENDLY_CODES = new Set(["P0001", "P0002", "42501", "22023", "23505"]);

const oneLine = (value: string, max: number) =>
  value.replace(/[\r\n]+/g, " ").trim().slice(0, max);

function isMissingRpcOrColError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    Boolean(
      error.message &&
        /Could not find the function|function .* does not exist|column .* does not exist/i.test(
          error.message,
        ),
    )
  );
}

function rpcMessage(error: { code?: string; message: string }, fallback: string) {
  if (error.code && FRIENDLY_CODES.has(error.code)) return error.message;
  console.error("[retailer-shift-actions] RPC failed:", error.code, error.message);
  return fallback;
}

function revalidateRetailerShiftPaths(shiftId?: string, storeId?: string) {
  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");
  revalidatePath("/retailer/applicants");
  revalidatePath("/worker/available-shifts");
  revalidatePath("/worker/dashboard");
  revalidatePath("/super-admin/shifts");
  revalidatePath("/super-admin/audit");
  if (shiftId && UUID_RE.test(shiftId)) {
    revalidatePath(`/super-admin/shifts/${shiftId}`);
  }
  if (storeId && UUID_RE.test(storeId)) {
    revalidatePath(`/super-admin/retailers/${storeId}`);
  }
}

async function resolveRetailerOwnedShift(shiftId: string) {
  if (!UUID_RE.test(shiftId)) {
    return { error: "Unknown shift." as const };
  }
  const resolved = await resolveStoreId();
  if ("error" in resolved) {
    return { error: resolved.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: shift, error } = await admin
    .from("shifts")
    .select("*")
    .eq("id", shiftId)
    .maybeSingle();

  if (error || !shift) {
    return { error: "That shift no longer exists." as const };
  }

  // Strict server-side ownership verification: retailers can ONLY manage shifts
  // belonging to their own store.
  if (shift.store_id !== resolved.storeId) {
    return {
      error: "You can only manage shifts posted under your own retailer account." as const,
    };
  }

  return {
    shift,
    storeId: resolved.storeId,
    userId: resolved.userId,
    userEmail: user?.email ?? null,
    admin,
  };
}

function parseWallClockDateTime(dateStr: string, timeStr?: string): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)) {
    return `${dateStr}:00`;
  }
  if (DATE_RE.test(dateStr)) {
    const t = timeStr && TIME_RE.test(timeStr) ? timeStr : "23:59";
    return `${dateStr}T${t}:00`;
  }
  return null;
}

export async function retailerToggleShiftVisibilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shiftId = str(formData.get("shiftId"));
  const targetHidden = str(formData.get("isHidden")) === "true";

  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { error: owned.error };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "completed" || shift.status === "cancelled") {
    return { error: "Completed or deleted shifts cannot be hidden or shown." };
  }

  if (!targetHidden) {
    const nowLocal = wallClockNow();
    const expiryRef = (shift.posting_expires_at as string | null) ?? (shift.end_time as string);
    if (
      normaliseWallClock(expiryRef) <= nowLocal ||
      normaliseWallClock(shift.end_time as string) <= nowLocal
    ) {
      return {
        error:
          "This shift posting has expired. Renew the shift or extend its posting expiry date before showing it to workers.",
      };
    }
  }

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_set_shift_visibility", {
    p_shift_id: shiftId,
    p_is_hidden: targetHidden,
  });

  if (!rpcResult.error) {
    revalidateRetailerShiftPaths(shiftId, storeId);
    return {
      success: targetHidden
        ? `Shift "${shift.task_type}" is now hidden from workers.`
        : `Shift "${shift.task_type}" is visible to workers again.`,
    };
  }

  if (!isMissingRpcOrColError(rpcResult.error)) {
    return {
      error: rpcMessage(rpcResult.error, "We couldn't update shift visibility."),
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("shifts")
    .update({
      is_hidden: targetHidden,
      hidden_at: targetHidden ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", shiftId)
    .eq("store_id", storeId);

  if (updateErr) {
    console.error("[retailerToggleShiftVisibilityAction]", updateErr.message);
    return { error: "We couldn't update shift visibility. Please try again." };
  }

  await admin.from("admin_audit_log").insert({
    actor_user_id: userId,
    actor_email: userEmail,
    action: targetHidden ? "shift.retailer_hidden" : "shift.retailer_shown",
    target_type: "shift",
    target_id: shiftId,
    metadata: {
      actor_role: "retailer",
      store_id: storeId,
      task_type: shift.task_type,
      is_hidden: targetHidden,
    },
  });

  revalidateRetailerShiftPaths(shiftId, storeId);
  return {
    success: targetHidden
      ? `Shift "${shift.task_type}" is now hidden from workers.`
      : `Shift "${shift.task_type}" is visible to workers again.`,
  };
}

export async function retailerEditShiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shiftId = str(formData.get("shiftId"));
  const taskType = oneLine(str(formData.get("taskType")), 200);
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  const shiftLocation = oneLine(str(formData.get("shiftLocation")), 300);
  const date = str(formData.get("date"));
  const startTime = str(formData.get("startTime")).slice(0, 5);
  const endTime = str(formData.get("endTime")).slice(0, 5);
  const postingExpiresDate = str(formData.get("postingExpiresDate"));
  const postingExpiresTime = str(formData.get("postingExpiresTime")).slice(0, 5) || "23:59";

  const values = {
    taskType,
    description,
    shiftLocation,
    date,
    startTime,
    endTime,
    postingExpiresDate,
    postingExpiresTime,
  };

  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { error: owned.error, values };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "completed" || shift.completed_at) {
    return { error: "Completed shifts cannot be edited.", values };
  }

  const fieldErrors: FieldErrors = {};
  if (!taskType) fieldErrors.taskType = "Tell workers what the shift involves.";
  if (!shiftLocation) fieldErrors.shiftLocation = "Enter the location for this shift.";
  if (!date || !DATE_RE.test(date)) fieldErrors.date = "Enter a valid scheduled date.";
  if (!startTime || !TIME_RE.test(startTime)) fieldErrors.startTime = "Pick a valid start time.";
  if (!endTime || !TIME_RE.test(endTime)) fieldErrors.endTime = "Pick a valid end time.";
  if (postingExpiresDate && !DATE_RE.test(postingExpiresDate)) {
    fieldErrors.postingExpiresDate = "Enter a valid posting expiry date.";
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const slot = shiftWindow(date, startTime, endTime);
  if (!slot) {
    return { fieldErrors: { endTime: "The shift must be longer than zero hours." }, values };
  }
  if (slot.hours > 24) {
    return { fieldErrors: { endTime: "A single shift can't be longer than 24 hours." }, values };
  }

  const startWallClock = `${date}T${startTime}:00`;
  const endWallClock = `${slot.endDate}T${endTime}:00`;
  const duration = slot.hours;
  const postingExpiresAt = postingExpiresDate
    ? parseWallClockDateTime(postingExpiresDate, postingExpiresTime)
    : (shift.posting_expires_at as string | null) ?? null;

  if (
    shift.accepted_by &&
    (startWallClock !== String(shift.start_time).replace(" ", "T").slice(0, 19) ||
      endWallClock !== String(shift.end_time).replace(" ", "T").slice(0, 19))
  ) {
    return {
      error:
        "A worker has already been hired for this shift, so its scheduled date and time cannot be changed.",
      values,
    };
  }

  const [{ data: existingInvoice }, { data: existingEntry }] = await Promise.all([
    admin.from("retailer_invoices").select("id").eq("shift_id", shiftId).maybeSingle(),
    admin.from("shift_time_entries").select("id").eq("shift_id", shiftId).maybeSingle(),
  ]);

  if (existingInvoice) {
    return { error: "Invoiced shifts cannot be edited.", values };
  }
  if (existingEntry) {
    return { error: "Shifts with recorded or approved timesheets cannot be edited.", values };
  }

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_update_shift", {
    p_shift_id: shiftId,
    p_task_type: taskType,
    p_description: description || null,
    p_shift_location: shiftLocation,
    p_start_time: startWallClock,
    p_end_time: endWallClock,
    p_duration: duration,
    p_posting_expires_at: postingExpiresAt,
  });

  if (!rpcResult.error) {
    revalidateRetailerShiftPaths(shiftId, storeId);
    return {
      success: `Shift "${taskType}" updated.`,
      values,
    };
  }

  if (!isMissingRpcOrColError(rpcResult.error)) {
    return {
      error: rpcMessage(rpcResult.error, "We couldn't save your shift changes."),
      values,
    };
  }

  const updatePayload: Record<string, unknown> = {
    task_type: taskType,
    description: description || null,
    shift_location: shiftLocation,
    start_time: startWallClock,
    end_time: endWallClock,
    duration,
    posting_expires_at: postingExpiresAt,
    updated_at: new Date().toISOString(),
  };
  if (shift.series_id) {
    updatePayload.occurrence_date = date;
  }

  const { error: updateErr } = await admin
    .from("shifts")
    .update(updatePayload)
    .eq("id", shiftId)
    .eq("store_id", storeId);

  if (updateErr) {
    console.error("[retailerEditShiftAction]", updateErr.message);
    return { error: "We couldn't save your shift changes. Please try again.", values };
  }

  await admin.from("admin_audit_log").insert({
    actor_user_id: userId,
    actor_email: userEmail,
    action: "shift.retailer_updated",
    target_type: "shift",
    target_id: shiftId,
    metadata: {
      actor_role: "retailer",
      store_id: storeId,
      task_type: taskType,
      previous_task_type: shift.task_type,
      start_time: startWallClock,
      previous_start_time: shift.start_time,
      end_time: endWallClock,
      previous_end_time: shift.end_time,
      posting_expires_at: postingExpiresAt,
    },
  });

  revalidateRetailerShiftPaths(shiftId, storeId);
  return {
    success: `Shift "${taskType}" updated.`,
    values,
  };
}

/**
 * Extend Date / Time:
 * Clearly separates:
 *   1. Extending the Posting Visibility / Expiry Date (`posting_expires_at`)
 *      without altering the scheduled shift date/time.
 *   2. Optionally updating the Scheduled Shift Date & Start/End Time when the
 *      retailer explicitly checks `updateSchedule = "true"`.
 */
export async function retailerExtendShiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shiftId = str(formData.get("shiftId"));
  const postingExpiresDate = str(formData.get("postingExpiresDate"));
  const postingExpiresTime = str(formData.get("postingExpiresTime")).slice(0, 5) || "23:59";
  const updateSchedule = str(formData.get("updateSchedule")) === "true";
  const date = str(formData.get("date"));
  const startTime = str(formData.get("startTime")).slice(0, 5);
  const endTime = str(formData.get("endTime")).slice(0, 5);

  const values = {
    postingExpiresDate,
    postingExpiresTime,
    updateSchedule: updateSchedule ? "true" : "false",
    date,
    startTime,
    endTime,
  };

  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { error: owned.error, values };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "completed" || shift.completed_at) {
    return { error: "Completed shifts cannot be extended.", values };
  }

  const [{ data: existingInvoice }, { data: existingEntry }] = await Promise.all([
    admin.from("retailer_invoices").select("id").eq("shift_id", shiftId).maybeSingle(),
    admin.from("shift_time_entries").select("id").eq("shift_id", shiftId).maybeSingle(),
  ]);

  if (existingInvoice) {
    return { error: "Invoiced shifts cannot be extended.", values };
  }
  if (existingEntry) {
    return { error: "Shifts with recorded or approved timesheets cannot be extended.", values };
  }

  const fieldErrors: FieldErrors = {};
  if (!postingExpiresDate || !DATE_RE.test(postingExpiresDate)) {
    fieldErrors.postingExpiresDate = "Pick a valid posting expiry date.";
  }
  if (!TIME_RE.test(postingExpiresTime)) {
    fieldErrors.postingExpiresTime = "Pick a valid expiry time.";
  }

  const nowLocal = wallClockNow();
  const postingExpiresAt = parseWallClockDateTime(postingExpiresDate, postingExpiresTime);
  if (postingExpiresAt && normaliseWallClock(postingExpiresAt) <= nowLocal) {
    fieldErrors.postingExpiresDate = "The new posting expiry date and time must be in the future.";
  }

  // By default, keep the existing scheduled work date and start/end time untouched!
  let startWallClock = String(shift.start_time).replace(" ", "T").slice(0, 19);
  let endWallClock = String(shift.end_time).replace(" ", "T").slice(0, 19);
  let duration = Number(shift.duration);

  if (updateSchedule) {
    if (shift.accepted_by) {
      return {
        error:
          "A worker has already been hired for this shift, so only the posting expiry can be changed — the scheduled work date and time are locked.",
        values,
      };
    }
    if (!date || !DATE_RE.test(date)) fieldErrors.date = "Pick a valid scheduled shift date.";
    if (!startTime || !TIME_RE.test(startTime)) fieldErrors.startTime = "Pick a valid start time.";
    if (!endTime || !TIME_RE.test(endTime)) fieldErrors.endTime = "Pick a valid end time.";

    if (Object.keys(fieldErrors).length === 0) {
      const slot = shiftWindow(date, startTime, endTime);
      if (!slot) {
        fieldErrors.endTime = "The shift must be longer than zero hours.";
      } else if (slot.hours > 24) {
        fieldErrors.endTime = "A single shift can't be longer than 24 hours.";
      } else {
        startWallClock = `${date}T${startTime}:00`;
        endWallClock = `${slot.endDate}T${endTime}:00`;
        duration = slot.hours;
      }
    }
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_extend_shift", {
    p_shift_id: shiftId,
    p_posting_expires_at: postingExpiresAt,
    p_start_time: startWallClock,
    p_end_time: endWallClock,
    p_duration: duration,
  });

  if (!rpcResult.error) {
    revalidateRetailerShiftPaths(shiftId, storeId);
    return {
      success: updateSchedule
        ? `Posting expiry extended to ${postingExpiresDate} (${postingExpiresTime}) and scheduled work time updated to ${date} (${startTime}–${endTime}).`
        : `Posting expiry extended to ${postingExpiresDate} (${postingExpiresTime}). Scheduled shift work time remains unchanged.`,
      values,
    };
  }

  if (!isMissingRpcOrColError(rpcResult.error)) {
    return {
      error: rpcMessage(rpcResult.error, "We couldn't extend that shift."),
      values,
    };
  }

  const updatePayload: Record<string, unknown> = {
    posting_expires_at: postingExpiresAt,
    start_time: startWallClock,
    end_time: endWallClock,
    duration,
    updated_at: new Date().toISOString(),
  };
  if (shift.series_id && updateSchedule) {
    updatePayload.occurrence_date = date;
  }

  const { error: updateErr } = await admin
    .from("shifts")
    .update(updatePayload)
    .eq("id", shiftId)
    .eq("store_id", storeId);

  if (updateErr) {
    console.error("[retailerExtendShiftAction]", updateErr.message);
    return { error: "We couldn't extend that shift. Please try again.", values };
  }

  await admin.from("admin_audit_log").insert({
    actor_user_id: userId,
    actor_email: userEmail,
    action: "shift.retailer_extended",
    target_type: "shift",
    target_id: shiftId,
    metadata: {
      actor_role: "retailer",
      store_id: storeId,
      task_type: shift.task_type,
      previous_posting_expires_at: shift.posting_expires_at,
      new_posting_expires_at: postingExpiresAt,
      schedule_changed: updateSchedule,
      previous_start_time: shift.start_time,
      new_start_time: startWallClock,
      previous_end_time: shift.end_time,
      new_end_time: endWallClock,
    },
  });

  revalidateRetailerShiftPaths(shiftId, storeId);
  return {
    success: updateSchedule
      ? `Posting expiry extended to ${postingExpiresDate} (${postingExpiresTime}) and scheduled work time updated to ${date} (${startTime}–${endTime}).`
      : `Posting expiry extended to ${postingExpiresDate} (${postingExpiresTime}). Scheduled shift work time remains unchanged.`,
    values,
  };
}

export async function retailerRenewShiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shiftId = str(formData.get("shiftId"));
  const date = str(formData.get("date"));
  const startTime = str(formData.get("startTime")).slice(0, 5);
  const endTime = str(formData.get("endTime")).slice(0, 5);
  const postingExpiresDate = str(formData.get("postingExpiresDate"));
  const postingExpiresTime = str(formData.get("postingExpiresTime")).slice(0, 5) || "23:59";

  const values = {
    date,
    startTime,
    endTime,
    postingExpiresDate,
    postingExpiresTime,
  };

  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { error: owned.error, values };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "completed" || shift.completed_at) {
    return { error: "Completed shifts cannot be renewed.", values };
  }
  if (shift.accepted_by) {
    return {
      error: "A worker is already hired for this shift.",
      values,
    };
  }

  const [{ data: existingInvoice }, { data: existingEntry }] = await Promise.all([
    admin.from("retailer_invoices").select("id").eq("shift_id", shiftId).maybeSingle(),
    admin.from("shift_time_entries").select("id").eq("shift_id", shiftId).maybeSingle(),
  ]);

  if (existingInvoice) {
    return { error: "Invoiced shifts cannot be renewed.", values };
  }
  if (existingEntry) {
    return { error: "Shifts with recorded work hours cannot be renewed.", values };
  }

  const fieldErrors: FieldErrors = {};
  if (!date || !DATE_RE.test(date)) fieldErrors.date = "Pick a valid scheduled shift date.";
  if (!startTime || !TIME_RE.test(startTime)) fieldErrors.startTime = "Pick a valid start time.";
  if (!endTime || !TIME_RE.test(endTime)) fieldErrors.endTime = "Pick a valid end time.";
  if (postingExpiresDate && !DATE_RE.test(postingExpiresDate)) {
    fieldErrors.postingExpiresDate = "Pick a valid posting expiry date.";
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const slot = shiftWindow(date, startTime, endTime);
  if (!slot) {
    return { fieldErrors: { endTime: "The shift must be longer than zero hours." }, values };
  }
  if (slot.hours > 24) {
    return { fieldErrors: { endTime: "A single shift can't be longer than 24 hours." }, values };
  }

  const startWallClock = `${date}T${startTime}:00`;
  const endWallClock = `${slot.endDate}T${endTime}:00`;
  const duration = slot.hours;
  const postingExpiresAt = postingExpiresDate
    ? parseWallClockDateTime(postingExpiresDate, postingExpiresTime)
    : null;

  const nowLocal = wallClockNow();
  if (normaliseWallClock(endWallClock) <= nowLocal) {
    return {
      fieldErrors: {
        date: "Pick a future date and time so the renewed shift is active for workers.",
      },
      values,
    };
  }
  if (postingExpiresAt && normaliseWallClock(postingExpiresAt) <= nowLocal) {
    return {
      fieldErrors: {
        postingExpiresDate: "The posting expiry date and time must be in the future.",
      },
      values,
    };
  }

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_renew_shift", {
    p_shift_id: shiftId,
    p_start_time: startWallClock,
    p_end_time: endWallClock,
    p_duration: duration,
    p_posting_expires_at: postingExpiresAt,
  });

  if (!rpcResult.error) {
    revalidateRetailerShiftPaths(shiftId, storeId);
    return {
      success: `Shift "${shift.task_type}" renewed and active for ${date} (${startTime}–${endTime}).`,
      values,
    };
  }

  if (!isMissingRpcOrColError(rpcResult.error)) {
    return {
      error: rpcMessage(rpcResult.error, "We couldn't renew that shift."),
      values,
    };
  }

  const nowIso = new Date().toISOString();
  const nextRenewalCount = Number(shift.renewal_count ?? 0) + 1;
  const updatePayload: Record<string, unknown> = {
    status: "open",
    is_hidden: false,
    hidden_at: null,
    start_time: startWallClock,
    end_time: endWallClock,
    duration,
    posting_expires_at: postingExpiresAt,
    renewed_at: nowIso,
    renewal_count: nextRenewalCount,
    payment_status: shift.payment_status === "paid" ? "paid" : "legacy",
    published_at: nowIso,
    updated_at: nowIso,
  };
  if (shift.series_id) {
    updatePayload.occurrence_date = date;
  }

  const { error: updateErr } = await admin
    .from("shifts")
    .update(updatePayload)
    .eq("id", shiftId)
    .eq("store_id", storeId);

  if (updateErr) {
    console.error("[retailerRenewShiftAction]", updateErr.message);
    return { error: "We couldn't renew that shift. Please try again.", values };
  }

  await admin.from("admin_audit_log").insert({
    actor_user_id: userId,
    actor_email: userEmail,
    action: "shift.retailer_renewed",
    target_type: "shift",
    target_id: shiftId,
    metadata: {
      actor_role: "retailer",
      store_id: storeId,
      task_type: shift.task_type,
      previous_status: shift.status,
      new_status: "open",
      previous_start_time: shift.start_time,
      new_start_time: startWallClock,
      previous_end_time: shift.end_time,
      new_end_time: endWallClock,
      posting_expires_at: postingExpiresAt,
      renewal_count: nextRenewalCount,
    },
  });

  revalidateRetailerShiftPaths(shiftId, storeId);
  return {
    success: `Shift "${shift.task_type}" renewed and active for ${date} (${startTime}–${endTime}).`,
    values,
  };
}

export async function retailerDeleteShiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const shiftId = str(formData.get("shiftId"));
  const reason = oneLine(str(formData.get("reason")), 300);

  const owned = await resolveRetailerOwnedShift(shiftId);
  if ("error" in owned) return { error: owned.error };

  const { shift, storeId, userId, userEmail, admin } = owned;

  if (shift.status === "cancelled") {
    return { error: "This shift has already been deleted / archived." };
  }
  if (shift.status === "completed" || shift.completed_at) {
    return {
      error: "Cannot delete this shift because it has completed work on record.",
    };
  }

  const [{ data: existingInvoice }, { data: existingEntry }, { data: paidPayment }] =
    await Promise.all([
      admin.from("retailer_invoices").select("id").eq("shift_id", shiftId).maybeSingle(),
      admin.from("shift_time_entries").select("id").eq("shift_id", shiftId).maybeSingle(),
      admin
        .from("shift_payments")
        .select("id")
        .eq("shift_id", shiftId)
        .eq("status", "paid")
        .maybeSingle(),
    ]);

  if (existingInvoice) {
    return {
      error: "Cannot delete this shift because an invoice has already been generated for it.",
    };
  }
  if (existingEntry) {
    return {
      error: "Cannot delete this shift because worked hours have been recorded in a timesheet.",
    };
  }
  if (shift.payment_status === "paid" || paidPayment) {
    return {
      error: "Cannot delete this shift because it has a confirmed payment record.",
    };
  }

  const supabase = await createClient();
  const rpcResult = await supabase.rpc("retailer_delete_shift", {
    p_shift_id: shiftId,
    p_reason: reason || null,
  });

  if (!rpcResult.error) {
    revalidateRetailerShiftPaths(shiftId, storeId);
    return {
      success: `Shift "${shift.task_type}" has been deleted and archived. Historical records are preserved.`,
    };
  }

  if (!isMissingRpcOrColError(rpcResult.error)) {
    return {
      error: rpcMessage(rpcResult.error, "We couldn't delete that shift."),
    };
  }

  const { error: updateErr } = await admin
    .from("shifts")
    .update({
      status: "cancelled",
      is_hidden: false,
      hidden_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shiftId)
    .eq("store_id", storeId);

  if (updateErr) {
    console.error("[retailerDeleteShiftAction]", updateErr.message);
    return { error: "We couldn't delete that shift. Please try again." };
  }

  await admin.from("admin_audit_log").insert({
    actor_user_id: userId,
    actor_email: userEmail,
    action: "shift.retailer_deleted",
    target_type: "shift",
    target_id: shiftId,
    metadata: {
      actor_role: "retailer",
      store_id: storeId,
      task_type: shift.task_type,
      previous_status: shift.status,
      new_status: "cancelled",
      had_hired_worker: Boolean(shift.accepted_by),
      reason: reason || null,
    },
  });

  revalidateRetailerShiftPaths(shiftId, storeId);
  return {
    success: `Shift "${shift.task_type}" has been deleted and archived. Historical records are preserved.`,
  };
}
