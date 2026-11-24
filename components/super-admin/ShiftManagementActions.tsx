"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  adminDeleteShiftAction,
  adminEditShiftAction,
  adminExtendShiftAction,
  adminRenewShiftAction,
  adminToggleShiftVisibilityAction,
} from "@/app/actions/super-admin";
import {
  Alert,
  FormGrid,
  FormRow,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui/Form";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { RETAILER_HOURLY_RATE, shiftWindow } from "@/lib/pricing";
import type { FormState } from "@/lib/validation";
import styles from "./Admin.module.css";

const TASK_SUGGESTIONS = [
  "Shop floor support",
  "Stocking and organising",
  "Till / checkout cover",
  "Deliveries and unpacking",
  "Window and display setup",
  "Stocktake",
  "Cleaning and reset",
];

export interface ShiftManagementStoreOption {
  value: string;
  label: string;
}

export interface ShiftManagementProps {
  shift: {
    id: string;
    storeId: string;
    storeName: string;
    taskType: string;
    description: string | null;
    shiftLocation: string;
    startTime: string;
    endTime: string;
    duration: number;
    hourlyRate: number;
    status: string;
    isHidden?: boolean;
    postingExpiresAt?: string | null;
    renewedAt?: string | null;
    renewalCount?: number;
    isExpired: boolean;
    hasHiredWorker: boolean;
    isRecurring: boolean;
  };
  stores: ShiftManagementStoreOption[];
  canRenew: boolean;
  renewDisabledReason?: string;
  canDelete: boolean;
  deleteBlockedReason?: string;
  canChangeStoreOrRate: boolean;
  storeOrRateLockedReason?: string;
}

type ActivePanel = "none" | "edit" | "extend" | "renew" | "delete";

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

export function ShiftManagementActions({
  shift,
  stores,
  canRenew,
  renewDisabledReason,
  canDelete,
  deleteBlockedReason,
  canChangeStoreOrRate,
  storeOrRateLockedReason,
}: ShiftManagementProps) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const initialDate = parseDatePart(shift.startTime) || futureDatePlusDays(1);
  const initialStart = parseTimePart(shift.startTime, "09:00");
  const initialEnd = parseTimePart(shift.endTime, "17:00");
  const initialExpiryDate =
    parseDatePart(shift.postingExpiresAt) || futureDatePlusDays(7);
  const initialExpiryTime = parseTimePart(shift.postingExpiresAt, "23:59");

  // Edit form live schedule calculation
  const [editDate, setEditDate] = useState(initialDate);
  const [editStart, setEditStart] = useState(initialStart);
  const [editEnd, setEditEnd] = useState(initialEnd);
  const [editRate, setEditRate] = useState(String(shift.hourlyRate || RETAILER_HOURLY_RATE));

  // Extend Date / Time state (separate Posting Expiry vs Scheduled Work Time)
  const [extendExpiryDate, setExtendExpiryDate] = useState(initialExpiryDate);
  const [extendExpiryTime, setExtendExpiryTime] = useState(initialExpiryTime);
  const [extendAlsoSchedule, setExtendAlsoSchedule] = useState(false);
  const [extendDate, setExtendDate] = useState(initialDate);
  const [extendStart, setExtendStart] = useState(initialStart);
  const [extendEnd, setExtendEnd] = useState(initialEnd);

  // Renew form live schedule calculation
  const [renewDate, setRenewDate] = useState(() => defaultRenewalDate(initialDate));
  const [renewStart, setRenewStart] = useState(initialStart);
  const [renewEnd, setRenewEnd] = useState(initialEnd);
  const [renewExpiryDate, setRenewExpiryDate] = useState(() => defaultRenewalDate(initialDate));
  const [renewExpiryTime, setRenewExpiryTime] = useState("23:59");

  const [visibilityState, visibilityAction] = useActionState<FormState, FormData>(
    adminToggleShiftVisibilityAction,
    {},
  );
  const [editState, editAction] = useActionState<FormState, FormData>(adminEditShiftAction, {});
  const [extendState, extendAction] = useActionState<FormState, FormData>(
    adminExtendShiftAction,
    {},
  );
  const [renewState, renewAction] = useActionState<FormState, FormData>(adminRenewShiftAction, {});
  const [deleteState, deleteAction] = useActionState<FormState, FormData>(
    adminDeleteShiftAction,
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

  const editRateNum = Number(editRate) || RETAILER_HOURLY_RATE;
  const editTotal = editWindow ? Math.round(editWindow.hours * editRateNum * 100) / 100 : null;
  const canHideOrShow = shift.status !== "completed" && shift.status !== "cancelled";
  const canExtend = shift.status !== "completed";

  return (
    <div className={styles.shiftManageWrap}>
      <div className={styles.shiftManageButtonGroup}>
        {/* 1. Edit Shift */}
        <button
          type="button"
          onClick={() => togglePanel("edit")}
          className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary} ${
            activePanel === "edit" ? styles.invoiceBtnActive : ""
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>{activePanel === "edit" ? "Close Edit" : "Edit Shift"}</span>
        </button>

        {/* 2. Hide / Show Shift */}
        {canHideOrShow ? (
          <form action={visibilityAction} style={{ display: "inline-flex" }}>
            <input type="hidden" name="shiftId" value={shift.id} />
            <input type="hidden" name="isHidden" value={shift.isHidden ? "false" : "true"} />
            <button
              type="submit"
              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
              title={
                shift.isHidden
                  ? "Make this shift visible to workers again"
                  : "Temporarily hide this shift from workers without deleting it"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {shift.isHidden ? (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                )}
              </svg>
              <span>{shift.isHidden ? "Show Shift" : "Hide Shift"}</span>
            </button>
          </form>
        ) : null}

        {/* 3. Extend Date / Time */}
        {canExtend ? (
          <button
            type="button"
            onClick={() => togglePanel("extend")}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary} ${
              activePanel === "extend" ? styles.invoiceBtnActive : ""
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{activePanel === "extend" ? "Close Extend" : "Extend Date / Time"}</span>
          </button>
        ) : null}

        {/* 4. Renew Shift */}
        {canRenew ? (
          <button
            type="button"
            onClick={() => togglePanel("renew")}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary} ${
              activePanel === "renew" ? styles.invoiceBtnActive : ""
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{activePanel === "renew" ? "Close Renew" : "Renew Shift"}</span>
          </button>
        ) : renewDisabledReason ? (
          <button
            type="button"
            disabled
            title={renewDisabledReason}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Renew Shift</span>
          </button>
        ) : null}

        {/* 5. Delete Shift */}
        <button
          type="button"
          onClick={() => togglePanel("delete")}
          disabled={shift.status === "cancelled"}
          title={
            shift.status === "cancelled"
              ? "This shift has already been deleted / cancelled."
              : deleteBlockedReason
          }
          className={`${styles.invoiceBtn} ${styles.shiftDeleteBtn} ${
            activePanel === "delete" ? styles.shiftDeleteBtnActive : ""
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>
            {shift.status === "cancelled"
              ? "Deleted / Cancelled"
              : activePanel === "delete"
                ? "Close Delete"
                : "Delete Shift"}
          </span>
        </button>
      </div>

      {banner ? (
        <div className={styles.invoiceFeedbackRow}>
          <Alert tone={banner.tone}>{banner.text}</Alert>
        </div>
      ) : null}

      {/* ─── Panel 1: Edit Shift Form ─── */}
      {activePanel === "edit" ? (
        <div className={styles.shiftModalPanel} role="region" aria-label={`Edit shift ${shift.taskType}`}>
          <div className={styles.shiftModalHeader}>
            <div>
              <h4 className={styles.shiftModalTitle}>Edit Shift — {shift.taskType}</h4>
              <p className={styles.shiftModalSubtitle}>
                Super Admin override: updates this shift record in place without creating a duplicate.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel("none")}
              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
            >
              Cancel
            </button>
          </div>

          <form action={editAction} noValidate className={styles.shiftModalForm}>
            <input type="hidden" name="shiftId" value={shift.id} />
            {!canChangeStoreOrRate ? (
              <input type="hidden" name="storeId" value={shift.storeId} />
            ) : null}

            <FormGrid>
              {editState.error ? <Alert tone="error">{editState.error}</Alert> : null}
              {!canChangeStoreOrRate && storeOrRateLockedReason ? (
                <Alert tone="info">{storeOrRateLockedReason}</Alert>
              ) : null}

              <FormRow>
                <Input
                  label="Shift title / task type"
                  name="taskType"
                  list={`task-suggestions-${shift.id}`}
                  defaultValue={editState.values?.taskType ?? shift.taskType}
                  error={editState.fieldErrors?.taskType}
                  required
                />
                <Select
                  label="Store / Retailer"
                  name={canChangeStoreOrRate ? "storeId" : "storeIdDisplay"}
                  defaultValue={editState.values?.storeId ?? shift.storeId}
                  error={editState.fieldErrors?.storeId}
                  disabled={!canChangeStoreOrRate}
                  hint={
                    shift.isRecurring
                      ? "Part of a recurring series (store locked)."
                      : "Assign to any retailer store."
                  }
                >
                  {stores.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </FormRow>

              <datalist id={`task-suggestions-${shift.id}`}>
                {TASK_SUGGESTIONS.map((task) => (
                  <option key={task} value={task} />
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

              <div className={styles.formRow3}>
                <Input
                  label="Scheduled shift date"
                  name="date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  error={editState.fieldErrors?.date}
                  required
                />
                <Input
                  label="Start time"
                  name="startTime"
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  error={editState.fieldErrors?.startTime}
                  required
                />
                <Input
                  label="End time"
                  name="endTime"
                  type="time"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  error={editState.fieldErrors?.endTime}
                  required
                />
              </div>

              <FormRow>
                <Input
                  label="Hourly billing rate ($/hr)"
                  name="hourlyRate"
                  type="number"
                  min={1}
                  max={500}
                  step={0.5}
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  readOnly={!canChangeStoreOrRate}
                  error={editState.fieldErrors?.hourlyRate}
                  hint={`Platform default is $${RETAILER_HOURLY_RATE}/hr.`}
                  required
                />
                <div className={styles.shiftLiveCalcBox}>
                  <span className={styles.shiftInfoLabel}>Calculated Scheduled Hours & Estimate</span>
                  <span className={styles.shiftInfoValue}>
                    {editWindow
                      ? `${formatDuration(editWindow.hours)}${editWindow.overnight ? " (overnight)" : ""} · $${editTotal?.toFixed(2)}`
                      : "Select valid start and end times"}
                  </span>
                  <span className={styles.shiftInfoMeta}>
                    Automatically calculated from start & end time.
                  </span>
                </div>
              </FormRow>

              <div className={styles.btnRow}>
                <SubmitButton small pendingLabel="Saving shift changes…">
                  Save Shift Changes
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
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
        <div className={styles.shiftModalPanel} role="region" aria-label={`Extend shift ${shift.taskType}`}>
          <div className={styles.shiftModalHeader}>
            <div>
              <h4 className={styles.shiftModalTitle}>
                Extend Date / Time — {shift.taskType} ({shift.storeName})
              </h4>
              <p className={styles.shiftModalSubtitle}>
                Extend the <strong>Posting Visibility Expiry</strong> (how long workers can apply) without changing the scheduled work date/time, or optionally adjust the scheduled shift window as well.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel("none")}
              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
            >
              Cancel
            </button>
          </div>

          <form action={extendAction} noValidate className={styles.shiftModalForm}>
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
                  hint="How long this posting remains open for worker applications."
                  required
                />
                <Input
                  label="Posting expiry time"
                  name="postingExpiresTime"
                  type="time"
                  value={extendExpiryTime}
                  onChange={(e) => setExtendExpiryTime(e.target.value)}
                  error={extendState.fieldErrors?.postingExpiresTime}
                  hint="Defaults to end of day (23:59)."
                  required
                />
              </FormRow>

              <div className={styles.shiftLiveCalcBox}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontFamily: "var(--font-heading)",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={extendAlsoSchedule}
                    onChange={(e) => setExtendAlsoSchedule(e.target.checked)}
                  />
                  <span>
                    2. Also change the actual scheduled work date / start &amp; end time
                  </span>
                </label>
                <span className={styles.shiftInfoMeta}>
                  {extendAlsoSchedule
                    ? "Both the posting expiry and the scheduled shift date/time below will be updated."
                    : `Unchecked: Scheduled work time stays ${formatDate(shift.startTime)} (${formatTime(shift.startTime)}–${formatTime(shift.endTime)}).`}
                </span>
              </div>

              {extendAlsoSchedule ? (
                <div className={styles.formRow3}>
                  <Input
                    label="New scheduled shift date"
                    name="date"
                    type="date"
                    value={extendDate}
                    onChange={(e) => setExtendDate(e.target.value)}
                    error={extendState.fieldErrors?.date}
                    required
                  />
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
                    hint={extendWindow ? `${formatDuration(extendWindow.hours)} scheduled` : undefined}
                    required
                  />
                </div>
              ) : null}

              <div className={styles.btnRow}>
                <SubmitButton small pendingLabel="Saving extension…">
                  Save Extension
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
                >
                  Cancel
                </button>
              </div>
            </FormGrid>
          </form>
        </div>
      ) : null}

      {/* ─── Panel 3: Renew Shift Form ─── */}
      {activePanel === "renew" && canRenew ? (
        <div className={styles.shiftModalPanel} role="region" aria-label={`Renew shift ${shift.taskType}`}>
          <div className={styles.shiftModalHeader}>
            <div>
              <h4 className={styles.shiftModalTitle}>
                Renew Shift — {shift.taskType} ({shift.storeName})
              </h4>
              <p className={styles.shiftModalSubtitle}>
                Reactivates this shift as <strong>OPEN</strong> and visible to workers without creating a duplicate shift record.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel("none")}
              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
            >
              Cancel
            </button>
          </div>

          <form action={renewAction} noValidate className={styles.shiftModalForm}>
            <input type="hidden" name="shiftId" value={shift.id} />
            <FormGrid>
              {renewState.error ? <Alert tone="error">{renewState.error}</Alert> : null}

              <div className={styles.formRow3}>
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
                  required
                />
              </div>

              <FormRow>
                <Input
                  label="Posting visibility expiry date"
                  name="postingExpiresDate"
                  type="date"
                  value={renewExpiryDate}
                  onChange={(e) => setRenewExpiryDate(e.target.value)}
                  error={renewState.fieldErrors?.postingExpiresDate}
                  hint="How long the renewed posting stays open for applications."
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

              <div className={styles.shiftLiveCalcBox}>
                <span className={styles.shiftInfoLabel}>Renewal Summary</span>
                <span className={styles.shiftInfoValue}>
                  {renewWindow
                    ? `Status will update to OPEN (Renewed) · ${formatDuration(renewWindow.hours)} @ $${shift.hourlyRate}/hr`
                    : "Choose a future date and valid start/end times"}
                </span>
                <span className={styles.shiftInfoMeta}>
                  Existing applications and shift ID ({shift.id.slice(0, 8)}…) are preserved.
                </span>
              </div>

              <div className={styles.btnRow}>
                <SubmitButton small pendingLabel="Renewing shift…">
                  Confirm &amp; Renew Shift
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
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
          className={`${styles.shiftModalPanel} ${styles.shiftDeletePanel}`}
          role="alertdialog"
          aria-labelledby={`delete-shift-title-${shift.id}`}
          aria-describedby={`delete-shift-desc-${shift.id}`}
        >
          <div className={styles.shiftModalHeader}>
            <div>
              <h4 id={`delete-shift-title-${shift.id}`} className={styles.shiftModalTitle}>
                Delete Shift — &ldquo;{shift.taskType}&rdquo; at {shift.storeName}?
              </h4>
              <p id={`delete-shift-desc-${shift.id}`} className={styles.shiftModalSubtitle}>
                {canDelete
                  ? `Confirm soft deletion of "${shift.taskType}" for store "${shift.storeName}". This archives and cancels the shift so it is removed from active listings while preserving all historical applications, hires, timesheets, invoices, payroll records, and audit logs.`
                  : "This shift cannot be deleted due to financial, timesheet, or payroll safeguards:"}
              </p>
            </div>
          </div>

          {!canDelete && deleteBlockedReason ? (
            <div className={styles.shiftModalForm}>
              <Alert tone="error">{deleteBlockedReason}</Alert>
              <div className={styles.btnRow} style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setActivePanel("none")}
                  className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form action={deleteAction} noValidate className={styles.shiftModalForm}>
              <input type="hidden" name="shiftId" value={shift.id} />
              <FormGrid>
                {deleteState.error ? <Alert tone="error">{deleteState.error}</Alert> : null}

                <Input
                  label="Reason for deletion (recorded in Audit Log)"
                  name="reason"
                  maxLength={300}
                  placeholder={`Why "${shift.taskType}" at ${shift.storeName} is being deleted`}
                  optional
                />

                <div className={styles.btnRow}>
                  <SubmitButton small variant="danger" pendingLabel="Deleting shift…">
                    Confirm Delete Shift
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setActivePanel("none")}
                    className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
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
