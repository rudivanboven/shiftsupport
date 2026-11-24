"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  cancelShift,
  retailerDeleteShiftAction,
  retailerEditShiftAction,
  retailerExtendShiftAction,
  retailerRenewShiftAction,
  retailerToggleShiftVisibilityAction,
} from "@/app/actions/shifts";
import {
  Alert,
  FormGrid,
  FormRow,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { RETAILER_HOURLY_RATE, priceShift, shiftWindow } from "@/lib/pricing";
import type { FormState } from "@/lib/validation";

const TASK_SUGGESTIONS = [
  "Shop floor support",
  "Stocking and organising",
  "Till / checkout cover",
  "Deliveries and unpacking",
  "Window and display setup",
  "Stocktake",
  "Cleaning and reset",
];

type ActivePanel = "none" | "edit" | "extend" | "renew" | "delete";

export interface RetailerShiftManagementProps {
  shift: {
    id: string;
    storeName: string;
    taskType: string;
    description: string | null;
    shiftLocation: string;
    startTime: string;
    endTime: string;
    duration: number;
    hourlyRate: number;
    status: string;
    isHidden: boolean;
    postingExpiresAt: string | null;
    renewedAt: string | null;
    renewalCount: number;
    isExpired: boolean;
    hasHiredWorker: boolean;
    isPaid: boolean;
  };
}

function parseDatePart(wallClock: string | null | undefined): string {
  if (!wallClock) return "";
  const m = wallClock.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function parseTimePart(wallClock: string | null | undefined, fallback: string): string {
  if (!wallClock) return fallback;
  const m = wallClock.match(/[T ](\d{2}:\d{2})/);
  return m ? m[1] : fallback;
}

function futureDatePlusDays(days = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultRenewalDate(currentDate: string): string {
  const tomorrow = futureDatePlusDays(1);
  return currentDate > tomorrow ? currentDate : tomorrow;
}

export function RetailerShiftManagementActions({ shift }: RetailerShiftManagementProps) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const initialDate = parseDatePart(shift.startTime) || futureDatePlusDays(1);
  const initialStart = parseTimePart(shift.startTime, "09:00");
  const initialEnd = parseTimePart(shift.endTime, "17:00");
  const initialExpiryDate =
    parseDatePart(shift.postingExpiresAt) || futureDatePlusDays(7);
  const initialExpiryTime = parseTimePart(shift.postingExpiresAt, "23:59");

  // Edit form state
  const [editDate, setEditDate] = useState(initialDate);
  const [editStart, setEditStart] = useState(initialStart);
  const [editEnd, setEditEnd] = useState(initialEnd);

  // Extend Date / Time state (separate Posting Expiry vs Scheduled Work Time)
  const [extendExpiryDate, setExtendExpiryDate] = useState(initialExpiryDate);
  const [extendExpiryTime, setExtendExpiryTime] = useState(initialExpiryTime);
  const [extendAlsoSchedule, setExtendAlsoSchedule] = useState(false);
  const [extendDate, setExtendDate] = useState(initialDate);
  const [extendStart, setExtendStart] = useState(initialStart);
  const [extendEnd, setExtendEnd] = useState(initialEnd);

  // Renew Shift state
  const [renewDate, setRenewDate] = useState(() => defaultRenewalDate(initialDate));
  const [renewStart, setRenewStart] = useState(initialStart);
  const [renewEnd, setRenewEnd] = useState(initialEnd);
  const [renewExpiryDate, setRenewExpiryDate] = useState(() => defaultRenewalDate(initialDate));
  const [renewExpiryTime, setRenewExpiryTime] = useState("23:59");

  const [visibilityState, visibilityAction] = useActionState<FormState, FormData>(
    retailerToggleShiftVisibilityAction,
    {},
  );
  const [editState, editAction] = useActionState<FormState, FormData>(retailerEditShiftAction, {});
  const [extendState, extendAction] = useActionState<FormState, FormData>(
    retailerExtendShiftAction,
    {},
  );
  const [renewState, renewAction] = useActionState<FormState, FormData>(
    retailerRenewShiftAction,
    {},
  );
  const [deleteState, deleteAction] = useActionState<FormState, FormData>(
    retailerDeleteShiftAction,
    {},
  );

  useEffect(() => {
    if (visibilityState.success) {
      setBanner({ tone: "success", text: visibilityState.success });
      router.refresh();
    } else if (visibilityState.error) {
      setBanner({ tone: "error", text: visibilityState.error });
    }
  }, [visibilityState.success, visibilityState.error, router]);

  useEffect(() => {
    if (editState.success) {
      setBanner({ tone: "success", text: editState.success });
      setActivePanel("none");
      router.refresh();
    }
  }, [editState.success, router]);

  useEffect(() => {
    if (extendState.success) {
      setBanner({ tone: "success", text: extendState.success });
      setActivePanel("none");
      router.refresh();
    }
  }, [extendState.success, router]);

  useEffect(() => {
    if (renewState.success) {
      setBanner({ tone: "success", text: renewState.success });
      setActivePanel("none");
      router.refresh();
    }
  }, [renewState.success, router]);

  useEffect(() => {
    if (deleteState.success) {
      setBanner({ tone: "success", text: deleteState.success });
      setActivePanel("none");
      router.refresh();
    }
  }, [deleteState.success, router]);

  const editWindow = useMemo(
    () => shiftWindow(editDate, editStart, editEnd),
    [editDate, editStart, editEnd],
  );
  const extendWindow = useMemo(
    () => shiftWindow(extendDate, extendStart, extendEnd),
    [extendDate, extendStart, extendEnd],
  );
  const renewWindow = useMemo(
    () => shiftWindow(renewDate, renewStart, renewEnd),
    [renewDate, renewStart, renewEnd],
  );

  const togglePanel = (panel: ActivePanel) => {
    setBanner(null);
    setActivePanel((current) => (current === panel ? "none" : panel));
  };

  const isCompleted = shift.status === "completed";
  const isDeleted = shift.status === "cancelled";
  const canEdit = !isCompleted;
  const canHideOrShow = !isCompleted && !isDeleted;
  const canExtend = !isCompleted;
  const canRenew = !isCompleted && !shift.hasHiredWorker;
  const canDelete = !isCompleted && !isDeleted && !shift.isPaid;

  const deleteBlockedReason = isCompleted
    ? "Cannot delete this shift because it has completed work on record."
    : shift.isPaid
      ? "Cannot delete this shift because it has a confirmed payment record."
      : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "100%",
        paddingTop: 12,
        marginTop: 4,
        borderTop: "1px dashed var(--line)",
      }}
    >
      {/* Posting Visibility & Renewal Metadata Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px 12px",
          fontSize: 12,
          color: "var(--muted)",
          fontFamily: "var(--font-heading)",
        }}
      >
        <span>
          <strong>Posting Expiry:</strong>{" "}
          {shift.postingExpiresAt
            ? `${formatDate(shift.postingExpiresAt)} · ${formatTime(shift.postingExpiresAt)}`
            : `${formatDate(shift.endTime)} · ${formatTime(shift.endTime)} (shift end)`}
        </span>
        {shift.renewalCount > 0 ? (
          <span style={{ color: "var(--brand-green)", fontWeight: 600 }}>
            Renewed {shift.renewalCount}x
          </span>
        ) : null}
      </div>

      {/* Six Separate Retailer Management Action Buttons */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* 1. Edit Shift */}
        {canEdit ? (
          <button
            type="button"
            onClick={() => togglePanel("edit")}
            className={buttonClass(activePanel === "edit" ? "primary" : "ghost", { small: true })}
          >
            {activePanel === "edit" ? "Close Edit" : "Edit Shift"}
          </button>
        ) : null}

        {/* 2. Extend Date / Time */}
        {canExtend ? (
          <button
            type="button"
            onClick={() => togglePanel("extend")}
            className={buttonClass(activePanel === "extend" ? "primary" : "ghost", {
              small: true,
            })}
          >
            {activePanel === "extend" ? "Close Extend" : "Extend Date / Time"}
          </button>
        ) : null}

        {/* 3. Renew Shift */}
        {canRenew ? (
          <button
            type="button"
            onClick={() => togglePanel("renew")}
            className={buttonClass(
              activePanel === "renew" || shift.isExpired || isDeleted
                ? "primary"
                : "ghost",
              { small: true },
            )}
          >
            {activePanel === "renew" ? "Close Renew" : "Renew Shift"}
          </button>
        ) : null}

        {/* 4 & 5. Hide Shift / Show Shift */}
        {canHideOrShow ? (
          <form action={visibilityAction} style={{ display: "inline-flex" }}>
            <input type="hidden" name="shiftId" value={shift.id} />
            <input type="hidden" name="isHidden" value={shift.isHidden ? "false" : "true"} />
            <button type="submit" className={buttonClass("ghost", { small: true })}>
              {shift.isHidden ? "Show Shift" : "Hide Shift"}
            </button>
          </form>
        ) : null}

        {/* 6. Delete Shift */}
        {!isDeleted ? (
          <button
            type="button"
            onClick={() => togglePanel("delete")}
            className={buttonClass("danger", { small: true })}
          >
            {activePanel === "delete" ? "Close Delete" : "Delete Shift"}
          </button>
        ) : null}
      </div>

      {banner ? <Alert tone={banner.tone}>{banner.text}</Alert> : null}

      {/* ─── Panel 1: Edit Shift ─── */}
      {activePanel === "edit" && canEdit ? (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "rgba(255, 253, 248, 0.95)",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Edit Shift — {shift.taskType}
          </p>
          <form action={editAction} noValidate>
            <input type="hidden" name="shiftId" value={shift.id} />
            <FormGrid>
              {editState.error ? <Alert tone="error">{editState.error}</Alert> : null}
              <Input
                label="Task / shift type"
                name="taskType"
                list={`retailer-tasks-${shift.id}`}
                defaultValue={editState.values?.taskType ?? shift.taskType}
                error={editState.fieldErrors?.taskType}
                required
              />
              <datalist id={`retailer-tasks-${shift.id}`}>
                {TASK_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>

              <Input
                label="Shift location"
                name="shiftLocation"
                defaultValue={editState.values?.shiftLocation ?? shift.shiftLocation}
                error={editState.fieldErrors?.shiftLocation}
                required
              />

              <Textarea
                label="Description"
                name="description"
                rows={2}
                defaultValue={editState.values?.description ?? shift.description ?? ""}
                error={editState.fieldErrors?.description}
                optional
              />

              <FormRow>
                <Input
                  label="Scheduled shift date"
                  name="date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  readOnly={shift.hasHiredWorker}
                  error={editState.fieldErrors?.date}
                  hint={
                    shift.hasHiredWorker
                      ? "Locked because a worker is already hired."
                      : undefined
                  }
                  required
                />
                <Input
                  label="Start time"
                  name="startTime"
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  readOnly={shift.hasHiredWorker}
                  error={editState.fieldErrors?.startTime}
                  required
                />
              </FormRow>

              <FormRow>
                <Input
                  label="End time"
                  name="endTime"
                  type="time"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  readOnly={shift.hasHiredWorker}
                  error={editState.fieldErrors?.endTime}
                  hint={
                    editWindow
                      ? `${formatDuration(editWindow.hours)} · $${priceShift(editWindow.hours).retailerTotal.toFixed(2)} est. @ $${RETAILER_HOURLY_RATE}/hr`
                      : undefined
                  }
                  required
                />
                <Input
                  label="Posting expiry date (optional)"
                  name="postingExpiresDate"
                  type="date"
                  defaultValue={
                    editState.values?.postingExpiresDate ??
                    parseDatePart(shift.postingExpiresAt)
                  }
                  error={editState.fieldErrors?.postingExpiresDate}
                  hint="How long workers can apply."
                  optional
                />
              </FormRow>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <SubmitButton small pendingLabel="Saving…">
                  Save Changes
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={buttonClass("ghost", { small: true })}
                >
                  Cancel
                </button>
              </div>
            </FormGrid>
          </form>
        </div>
      ) : null}

      {/* ─── Panel 2: Extend Date / Time (Separate Posting Expiry vs Scheduled Work Time) ─── */}
      {activePanel === "extend" && canExtend ? (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "rgba(255, 253, 248, 0.95)",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Extend Date / Time — {shift.taskType}
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted)" }}>
            Extending the posting expiry date keeps the shift open for worker applications without changing when the work happens.
          </p>

          <form action={extendAction} noValidate>
            <input type="hidden" name="shiftId" value={shift.id} />
            <input
              type="hidden"
              name="updateSchedule"
              value={extendAlsoSchedule ? "true" : "false"}
            />
            <FormGrid>
              {extendState.error ? <Alert tone="error">{extendState.error}</Alert> : null}

              <FormRow>
                <Input
                  label="1. Posting visibility expiry date"
                  name="postingExpiresDate"
                  type="date"
                  value={extendExpiryDate}
                  onChange={(e) => setExtendExpiryDate(e.target.value)}
                  error={extendState.fieldErrors?.postingExpiresDate}
                  hint="How long workers can apply."
                  required
                />
                <Input
                  label="Posting expiry time"
                  name="postingExpiresTime"
                  type="time"
                  value={extendExpiryTime}
                  onChange={(e) => setExtendExpiryTime(e.target.value)}
                  error={extendState.fieldErrors?.postingExpiresTime}
                  required
                />
              </FormRow>

              {!shift.hasHiredWorker ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={extendAlsoSchedule}
                    onChange={(e) => setExtendAlsoSchedule(e.target.checked)}
                  />
                  <span>2. Also modify the scheduled shift work date / start &amp; end time</span>
                </label>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                  A worker is already hired for this shift, so scheduled work hours are locked.
                </p>
              )}

              {extendAlsoSchedule && !shift.hasHiredWorker ? (
                <>
                  <Input
                    label="New scheduled shift date"
                    name="date"
                    type="date"
                    value={extendDate}
                    onChange={(e) => setExtendDate(e.target.value)}
                    error={extendState.fieldErrors?.date}
                    required
                  />
                  <FormRow>
                    <Input
                      label="Start time"
                      name="startTime"
                      type="time"
                      value={extendStart}
                      onChange={(e) => setExtendStart(e.target.value)}
                      error={extendState.fieldErrors?.startTime}
                      required
                    />
                    <Input
                      label="End time"
                      name="endTime"
                      type="time"
                      value={extendEnd}
                      onChange={(e) => setExtendEnd(e.target.value)}
                      error={extendState.fieldErrors?.endTime}
                      hint={
                        extendWindow ? `${formatDuration(extendWindow.hours)} scheduled` : undefined
                      }
                      required
                    />
                  </FormRow>
                </>
              ) : null}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <SubmitButton small pendingLabel="Extending…">
                  Save Extension
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={buttonClass("ghost", { small: true })}
                >
                  Cancel
                </button>
              </div>
            </FormGrid>
          </form>
        </div>
      ) : null}

      {/* ─── Panel 3: Renew Shift (In-place renewal without duplicate rows) ─── */}
      {activePanel === "renew" && canRenew ? (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid var(--brand-green-shadow)",
            background: "rgba(255, 253, 248, 0.98)",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            Renew Shift — {shift.taskType}
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted)" }}>
            Reactivates this shift posting as <strong>Active / Open</strong> for workers without creating a duplicate shift.
          </p>

          <form action={renewAction} noValidate>
            <input type="hidden" name="shiftId" value={shift.id} />
            <FormGrid>
              {renewState.error ? <Alert tone="error">{renewState.error}</Alert> : null}

              <Input
                label="New scheduled shift date"
                name="date"
                type="date"
                value={renewDate}
                onChange={(e) => {
                  setRenewDate(e.target.value);
                  if (renewExpiryDate < e.target.value) {
                    setRenewExpiryDate(e.target.value);
                  }
                }}
                error={renewState.fieldErrors?.date}
                required
              />

              <FormRow>
                <Input
                  label="Start time"
                  name="startTime"
                  type="time"
                  value={renewStart}
                  onChange={(e) => setRenewStart(e.target.value)}
                  error={renewState.fieldErrors?.startTime}
                  required
                />
                <Input
                  label="End time"
                  name="endTime"
                  type="time"
                  value={renewEnd}
                  onChange={(e) => setRenewEnd(e.target.value)}
                  error={renewState.fieldErrors?.endTime}
                  hint={
                    renewWindow ? `${formatDuration(renewWindow.hours)} scheduled` : undefined
                  }
                  required
                />
              </FormRow>

              <FormRow>
                <Input
                  label="Posting visibility expiry date"
                  name="postingExpiresDate"
                  type="date"
                  value={renewExpiryDate}
                  onChange={(e) => setRenewExpiryDate(e.target.value)}
                  error={renewState.fieldErrors?.postingExpiresDate}
                  hint="How long workers can apply."
                />
                <Input
                  label="Posting expiry time"
                  name="postingExpiresTime"
                  type="time"
                  value={renewExpiryTime}
                  onChange={(e) => setRenewExpiryTime(e.target.value)}
                  error={renewState.fieldErrors?.postingExpiresTime}
                />
              </FormRow>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <SubmitButton small pendingLabel="Renewing…">
                  Confirm &amp; Renew Shift
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={buttonClass("ghost", { small: true })}
                >
                  Cancel
                </button>
              </div>
            </FormGrid>
          </form>
        </div>
      ) : null}

      {/* ─── Panel 4: Delete Shift Confirmation Dialog ─── */}
      {activePanel === "delete" ? (
        <div
          role="alertdialog"
          aria-labelledby={`retailer-del-title-${shift.id}`}
          aria-describedby={`retailer-del-desc-${shift.id}`}
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid rgba(185, 64, 52, 0.35)",
            background: "#fffafa",
          }}
        >
          <p
            id={`retailer-del-title-${shift.id}`}
            style={{
              margin: "0 0 6px",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
              fontWeight: 600,
              color: "#8c291f",
            }}
          >
            Delete Shift — &ldquo;{shift.taskType}&rdquo; at {shift.storeName}?
          </p>
          <p
            id={`retailer-del-desc-${shift.id}`}
            style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted)" }}
          >
            {canDelete
              ? `This archives and cancels "${shift.taskType}" at ${shift.storeName} so it is removed from active worker listings while preserving all historical applications and records.`
              : deleteBlockedReason}
          </p>

          {!canDelete ? (
            <button
              type="button"
              onClick={() => setActivePanel("none")}
              className={buttonClass("ghost", { small: true })}
            >
              Close
            </button>
          ) : (
            <form action={deleteAction} noValidate>
              <input type="hidden" name="shiftId" value={shift.id} />
              <FormGrid>
                {deleteState.error ? <Alert tone="error">{deleteState.error}</Alert> : null}
                <Input
                  label="Reason (optional)"
                  name="reason"
                  maxLength={300}
                  placeholder="Why this shift is being deleted"
                  optional
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <SubmitButton small variant="danger" pendingLabel="Deleting…">
                    Confirm Delete Shift
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setActivePanel("none")}
                    className={buttonClass("ghost", { small: true })}
                  >
                    Keep Shift
                  </button>
                </div>
              </FormGrid>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CancelShiftButton({
  shiftId,
  label = "Cancel shift",
}: {
  shiftId: string;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelShift(shiftId);
      if (!result.ok) {
        setError(result.error ?? "We couldn't cancel that shift.");
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  };

  if (error) {
    return (
      <span style={{ fontSize: 12.5, color: "#a63f27", fontFamily: "var(--font-body)" }}>
        {error}
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass("danger", { small: true })}
        onClick={confirm}
        disabled={pending}
      >
        {pending ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Keep it
      </button>
    </>
  );
}
