import type { BadgeTone } from "@/components/ui/Kit";
import type { PayrollStage } from "./snapshot";
import type { ApplicationStatus, ShiftPaymentStatus, ShiftStatus } from "@/lib/supabase/types";

/** Operations wording for the states already in the schema. */

export const SHIFT_STATUS: Record<ShiftStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Awaiting payment", tone: "pending" },
  open: { label: "Open", tone: "open" },
  filled: { label: "Hired", tone: "filled" },
  completed: { label: "Completed", tone: "approved" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
};

export const PAYMENT_STATUS: Record<ShiftPaymentStatus, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "rejected" },
  pending: { label: "Checkout open", tone: "pending" },
  paid: { label: "Paid", tone: "approved" },
  failed: { label: "Failed", tone: "cancelled" },
  legacy: { label: "Pre-Stripe", tone: "neutral" },
};

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "pending" },
  approved: { label: "Hired", tone: "approved" },
  rejected: { label: "Not selected", tone: "rejected" },
};

export const STAGE_LABELS: Record<PayrollStage, string> = {
  scheduled: "Scheduled",
  awaiting_completion: "Awaiting completion",
  awaiting_hours: "Awaiting hours",
  awaiting_approval: "Awaiting hours approval",
  hours_rejected: "Hours rejected",
  ready: "Ready for payroll",
  exported: "Exported",
  submitted: "Submitted to ADP",
  processed: "Payroll processed",
  error: "Payroll error",
};

export const STAGE_TONES: Record<PayrollStage, BadgeTone> = {
  scheduled: "neutral",
  awaiting_completion: "neutral",
  awaiting_hours: "pending",
  awaiting_approval: "pending",
  hours_rejected: "cancelled",
  ready: "open",
  exported: "filled",
  submitted: "filled",
  processed: "approved",
  error: "cancelled",
};

export const STAGE_HELP: Record<PayrollStage, string> = {
  scheduled: "The shift has not started yet.",
  awaiting_completion: "The shift has finished but the store has not confirmed it happened.",
  awaiting_hours: "Completed — the hours actually worked still need recording.",
  awaiting_approval: "Hours recorded, waiting on operations approval.",
  hours_rejected: "The recorded hours were rejected and need correcting.",
  ready: "Approved hours, ready to go to ADP.",
  exported: "Included in a payroll export (CSV).",
  submitted: "Marked as submitted to ADP by an operator.",
  processed: "ADP has processed this payroll line.",
  error: "Something went wrong with this payroll line.",
};
