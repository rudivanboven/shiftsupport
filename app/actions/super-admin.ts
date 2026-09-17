"use server";

import { revalidatePath } from "next/cache";

import { assertSuperAdmin, adminDb, NotAuthorisedError } from "@/lib/admin/auth";
import { parseLocalDateTime } from "@/lib/admin/dates";
import { getEmailProvider } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_RE, type FormState, str } from "@/lib/validation";

/**
 * Operations Control Center mutations.
 *
 * Every action here:
 *   1. re-authorises the caller (`assertSuperAdmin`) — server actions are
 *      public POST endpoints, so the page having rendered proves nothing;
 *   2. validates its input on the server;
 *   3. writes through a SECURITY DEFINER function called with the caller's
 *      OWN session, so the database checks `is_super_admin()` again and
 *      writes the audit entry in the same transaction.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "Something went wrong. Please try again.";

/** Our own SQL functions raise user-facing messages with these codes. */
const FRIENDLY_CODES = new Set(["P0001", "P0002", "42501", "22023", "23505"]);

function rpcMessage(error: { code?: string; message: string }) {
  if (error.code && FRIENDLY_CODES.has(error.code)) return error.message;
  console.error("[super-admin] RPC failed:", error.code, error.message);
  return GENERIC;
}

async function guard(): Promise<FormState | null> {
  try {
    await assertSuperAdmin();
    return null;
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { error: "Not authorised." };
    throw error;
  }
}

const oneLine = (value: string, max: number) => value.replace(/[\r\n]+/g, " ").trim().slice(0, max);

/* ------------------------------------------------------------------ *
 * Admin access
 * ------------------------------------------------------------------ */

export async function grantSuperAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const email = str(formData.get("email")).toLowerCase();
  const note = oneLine(str(formData.get("note")), 300);
  if (!EMAIL_RE.test(email)) return { fieldErrors: { email: "Enter a valid email address." }, values: { email, note } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_super_admin", { p_email: email, p_note: note || null });
  if (error) return { error: rpcMessage(error), values: { email, note } };

  revalidatePath("/super-admin/admins");
  revalidatePath("/super-admin/audit");
  return { success: `Super Admin access granted to ${email}.` };
}

export async function revokeSuperAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const userId = str(formData.get("userId"));
  const reason = oneLine(str(formData.get("reason")), 300);
  if (!UUID_RE.test(userId)) return { error: "Unknown account." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_super_admin", { p_user_id: userId, p_reason: reason || null });
  if (error) return { error: rpcMessage(error) };

  revalidatePath("/super-admin/admins");
  revalidatePath("/super-admin/audit");
  return { success: "Super Admin access revoked." };
}

/* ------------------------------------------------------------------ *
 * Communications
 * ------------------------------------------------------------------ */

export interface EmailActionState extends FormState {
  outcome?: "sent" | "not_configured" | "failed";
  mailto?: string;
}

type RecipientType = "worker" | "retailer";

/**
 * The recipient address is always resolved on the server from the record —
 * the To field in the browser is display only, so this cannot be used to
 * send mail to arbitrary addresses.
 */
async function resolveRecipient(type: RecipientType, id: string): Promise<{ email: string; name: string | null } | null> {
  const db = await adminDb();

  if (type === "worker") {
    const { data } = await db.from("workers").select("full_name,email,auth_user_id").eq("id", id).maybeSingle();
    if (!data) return null;
    let email = (data.email as string | null) ?? null;
    if (!email && data.auth_user_id) {
      const { data: profile } = await db.from("profiles").select("email").eq("id", data.auth_user_id).maybeSingle();
      email = (profile?.email as string | null) ?? null;
    }
    return email && EMAIL_RE.test(email) ? { email, name: (data.full_name as string | null) ?? null } : null;
  }

  const { data: owners } = await db
    .from("store_users")
    .select("email,role,auth_user_id")
    .eq("store_id", id)
    .order("created_at", { ascending: true });
  const owner = (owners ?? []).sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0))[0];
  if (!owner?.email || !EMAIL_RE.test(owner.email)) return null;
  const { data: store } = await db.from("stores").select("name").eq("id", id).maybeSingle();
  return { email: owner.email as string, name: (store?.name as string | null) ?? null };
}

export async function sendAdminEmail(_prev: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const denied = await guard();
  if (denied) return denied;

  const recipientType = str(formData.get("recipientType")) as RecipientType;
  const recipientId = str(formData.get("recipientId"));
  const subject = oneLine(str(formData.get("subject")), 200);
  const message = String(formData.get("message") ?? "").trim().slice(0, 10_000);
  const values = { subject, message };

  if (!(recipientType === "worker" || recipientType === "retailer") || !UUID_RE.test(recipientId)) {
    return { error: "Unknown recipient.", values };
  }

  const fieldErrors: Record<string, string> = {};
  if (!subject) fieldErrors.subject = "Add a subject.";
  if (!message) fieldErrors.message = "Write a message.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const recipient = await resolveRecipient(recipientType, recipientId);
  if (!recipient) return { error: "This person has no valid email address on file.", values };

  const supabase = await createClient();
  const record = (status: string, provider: string | null, messageId: string | null, err: string | null) =>
    supabase.rpc("admin_record_communication", {
      p_recipient_type: recipientType,
      p_recipient_id: recipientId,
      p_recipient_email: recipient.email,
      p_subject: subject,
      p_status: status,
      p_provider: provider,
      p_provider_message_id: messageId,
      p_error: err,
    });

  const availability = getEmailProvider();
  if (!availability.configured) {
    const mailto = `mailto:${encodeURIComponent(recipient.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.slice(0, 1800))}`;
    return {
      outcome: "not_configured",
      mailto,
      values,
      error: `Email sending isn't set up on the server yet. ${availability.reason} You can open this message in your own mail app instead.`,
    };
  }

  try {
    const admin = await assertSuperAdmin();
    const result = await availability.provider.send({
      from: availability.from,
      to: recipient.email,
      subject,
      text: message,
      replyTo: admin.email || undefined,
    });
    const { error } = await record("sent", availability.provider.id, result.providerMessageId, null);
    if (error) console.error("[super-admin] Email sent but not recorded:", error.message);
    revalidatePath("/super-admin/communications");
    return { outcome: "sent", success: `Email sent to ${recipient.email}.` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error("[super-admin] Email provider failed:", reason);
    await record("failed", availability.provider.id, null, reason);
    revalidatePath("/super-admin/communications");
    return { outcome: "failed", error: "The email could not be sent. Please try again.", values };
  }
}

/** Logged when the admin chooses "Open in mail app" after a not-configured send. */
export async function recordMailClientHandoff(
  recipientType: string,
  recipientId: string,
  subject: string,
): Promise<{ ok: boolean }> {
  const denied = await guard();
  if (denied) return { ok: false };
  if (!(recipientType === "worker" || recipientType === "retailer") || !UUID_RE.test(recipientId)) return { ok: false };

  const recipient = await resolveRecipient(recipientType, recipientId);
  if (!recipient) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_communication", {
    p_recipient_type: recipientType,
    p_recipient_id: recipientId,
    p_recipient_email: recipient.email,
    p_subject: oneLine(String(subject ?? ""), 200),
    p_status: "handed_to_mail_client",
    p_provider: "mail_client",
    p_provider_message_id: null,
    p_error: null,
  });
  if (error) console.error("[super-admin] Could not record mail hand-off:", error.message);
  revalidatePath("/super-admin/communications");
  return { ok: !error };
}

/* ------------------------------------------------------------------ *
 * Worked hours & payroll
 * ------------------------------------------------------------------ */

export async function recordShiftHoursAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const shiftId = str(formData.get("shiftId"));
  const startRaw = str(formData.get("actualStart"));
  const endRaw = str(formData.get("actualEnd"));
  const breakRaw = str(formData.get("breakMinutes")) || "0";
  const note = oneLine(str(formData.get("note")), 500);
  const values = { actualStart: startRaw, actualEnd: endRaw, breakMinutes: breakRaw, note };

  if (!UUID_RE.test(shiftId)) return { error: "Unknown shift.", values };

  const start = parseLocalDateTime(startRaw);
  const end = parseLocalDateTime(endRaw);
  const breakMinutes = Number(breakRaw);
  const fieldErrors: Record<string, string> = {};
  if (!start) fieldErrors.actualStart = "Enter the actual start date and time.";
  if (!end) fieldErrors.actualEnd = "Enter the actual end date and time.";
  if (start && end && end <= start) fieldErrors.actualEnd = "The end must be after the start.";
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
    fieldErrors.breakMinutes = "Unpaid break must be 0–720 whole minutes.";
  }
  if (!note) fieldErrors.note = "Say where these hours came from (e.g. confirmed by the store manager).";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_shift_hours", {
    p_shift_id: shiftId,
    p_actual_start: start,
    p_actual_end: end,
    p_break_minutes: breakMinutes,
    p_note: note,
  });
  if (error) return { error: rpcMessage(error), values };

  revalidatePath("/super-admin/payroll");
  revalidatePath(`/super-admin/shifts/${shiftId}`);
  return { success: "Hours recorded. They still need approval before payroll." };
}

export async function reviewShiftHoursAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const shiftId = str(formData.get("shiftId"));
  const decision = str(formData.get("decision"));
  const hoursRaw = str(formData.get("approvedHours"));
  const note = oneLine(str(formData.get("note")), 500);
  const values = { approvedHours: hoursRaw, note };

  if (!UUID_RE.test(shiftId) || !(decision === "approve" || decision === "reject")) {
    return { error: "Unknown request.", values };
  }

  let hours: number | null = null;
  if (decision === "approve" && hoursRaw) {
    hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return { fieldErrors: { approvedHours: "Approved hours must be more than 0 and at most 24." }, values };
    }
  }
  if (decision === "reject" && !note) {
    return { fieldErrors: { note: "Give a reason so the hours can be corrected." }, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_shift_hours", {
    p_shift_id: shiftId,
    p_decision: decision,
    p_approved_hours: hours,
    p_note: note || null,
  });
  if (error) return { error: rpcMessage(error), values };

  revalidatePath("/super-admin/payroll");
  revalidatePath(`/super-admin/shifts/${shiftId}`);
  return { success: decision === "approve" ? "Hours approved — ready for payroll." : "Hours rejected." };
}

const MANUAL_STATUSES = new Set(["ready", "submitted", "processed", "error"]);

export async function setPayrollStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const status = str(formData.get("status"));
  const shiftIds = formData.getAll("shiftId").map((v) => String(v)).filter((v) => UUID_RE.test(v));
  const externalRef = oneLine(str(formData.get("externalRef")), 200);
  const errorText = oneLine(str(formData.get("errorText")), 500);

  if (!MANUAL_STATUSES.has(status)) return { error: "Unknown payroll status." };
  if (!shiftIds.length) return { error: "Choose at least one shift." };
  if (shiftIds.length > 1000) return { error: "Choose at most 1000 shifts at a time." };
  if (status === "error" && !errorText) return { error: "Describe the payroll error." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_payroll_status", {
    p_shift_ids: shiftIds,
    p_status: status,
    p_provider: status === "submitted" || status === "processed" ? "adp_manual" : null,
    p_batch_id: null,
    p_external_ref: externalRef || null,
    p_error: status === "error" ? errorText : null,
  });
  if (error) return { error: rpcMessage(error) };

  revalidatePath("/super-admin/payroll");
  const updated = Number(data ?? 0);
  return updated
    ? { success: `${updated} payroll record${updated === 1 ? "" : "s"} updated.` }
    : { error: "Nothing changed — those records are not in a state that allows this step." };
}

export async function setWorkerPayrollIdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const workerId = str(formData.get("workerId"));
  const employeeId = str(formData.get("employeeId"));
  if (!UUID_RE.test(workerId)) return { error: "Unknown worker." };
  if (employeeId && !/^[A-Za-z0-9._-]{1,64}$/.test(employeeId)) {
    return { fieldErrors: { employeeId: "Letters, digits, dot, dash and underscore only (max 64)." }, values: { employeeId } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_worker_payroll_identity", {
    p_worker_id: workerId,
    p_external_employee_id: employeeId || null,
    p_provider: "adp",
  });
  if (error) return { error: rpcMessage(error), values: { employeeId } };

  revalidatePath(`/super-admin/workers/${workerId}`);
  revalidatePath("/super-admin/payroll");
  return { success: employeeId ? "Payroll employee id saved." : "Payroll employee id cleared." };
}
