"use client";

import { useActionState, useMemo, useState } from "react";
import { createShift } from "@/app/actions/shifts";
import {
  Alert,
  FormGrid,
  FormRow,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import { Panel } from "@/components/ui/Kit";
import { IconCheck } from "@/components/dashboard/Icons";
import { formatDate, formatDuration } from "@/lib/format";
import { RETAILER_HOURLY_RATE, priceShift, shiftWindow } from "@/lib/pricing";
import type { FormState } from "@/lib/validation";
import styles from "./PostShiftForm.module.css";

const TASK_SUGGESTIONS = [
  "Shop floor support",
  "Stocking and organising",
  "Till / checkout cover",
  "Deliveries and unpacking",
  "Window and display setup",
  "Stocktake",
  "Cleaning and reset",
];

const today = () => new Date().toISOString().slice(0, 10);

const formatUsd = (value: number, alwaysShowCents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: alwaysShowCents ? 2 : value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function PostShiftForm({
  storeName,
  storeAddress,
}: {
  storeName: string;
  storeAddress: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createShift, {});

  const [taskType, setTaskType] = useState("");
  const [shiftLocation, setShiftLocation] = useState(storeAddress);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Duration drives the estimate: as soon as the date and both times are
  // valid, the cost is duration x the fixed platform rate. The retailer never
  // types either number.
  const { duration, total, overnight } = useMemo(() => {
    const slot = shiftWindow(date, startTime, endTime);
    if (!slot) return { duration: null, total: null, overnight: false };
    return {
      duration: slot.hours,
      total: priceShift(slot.hours).retailerTotal,
      overnight: slot.overnight,
    };
  }, [date, startTime, endTime]);

  if (state.success) {
    return (
      <Panel>
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <IconCheck width={28} height={28} />
          </span>
          <h3 className={styles.successTitle}>Your shift has been posted</h3>
          <p className={styles.successText}>
            It&apos;s live now and workers nearby can apply straight away. You&apos;ll see
            applicants appear on your dashboard as they come in.
          </p>
          <div className={styles.successActions}>
            <a className={buttonClass("primary")} href="/retailer/shifts">
              View my shifts
            </a>
            <a
              className={buttonClass("ghost")}
              href={`/retailer/applicants?shift=${state.success}`}
            >
              See applicants
            </a>
            <button
              type="button"
              className={buttonClass("ghost")}
              // A reload is the cleanest way back to a fresh action state.
              onClick={() => window.location.reload()}
            >
              Post another shift
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className={styles.layout}>
      <Panel
        title="Shift details"
        description="Workers see everything below before they apply."
      >
        <form action={formAction} noValidate>
          <FormGrid>
            {state.error ? <Alert tone="error">{state.error}</Alert> : null}

            <Input
              label="Task / shift type"
              name="taskType"
              list="task-suggestions"
              placeholder="e.g. Saturday shop floor support"
              defaultValue={state.values?.taskType}
              error={state.fieldErrors?.taskType}
              onChange={(e) => setTaskType(e.target.value)}
              required
            />
            <datalist id="task-suggestions">
              {TASK_SUGGESTIONS.map((task) => (
                <option key={task} value={task} />
              ))}
            </datalist>

            <Textarea
              label="Description"
              name="description"
              placeholder="What will the shift involve? Anything the worker should bring or know?"
              hint="Optional, but shifts with a description get more applicants."
              defaultValue={state.values?.description}
              error={state.fieldErrors?.description}
              optional
            />

            <Input
              label="📍 Shift location"
              name="shiftLocation"
              placeholder="Enter shift location"
              hint="Using your store address. You can change it for this shift."
              value={shiftLocation}
              error={state.fieldErrors?.shiftLocation}
              onChange={(event) => setShiftLocation(event.target.value)}
              required
            />

            <Input
              label="Date"
              name="date"
              type="date"
              min={today()}
              defaultValue={state.values?.date}
              error={state.fieldErrors?.date}
              onChange={(e) => setDate(e.target.value)}
              required
            />

            <FormRow>
              <Input
                label="Start time"
                name="startTime"
                type="time"
                defaultValue={state.values?.startTime}
                error={state.fieldErrors?.startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
              <Input
                label="End time"
                name="endTime"
                type="time"
                defaultValue={state.values?.endTime}
                error={state.fieldErrors?.endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </FormRow>

            <div className={styles.rateCard}>
              <span className={styles.rateLabel}>Hourly rate</span>
              <p className={styles.rateValue}>
                {formatUsd(RETAILER_HOURLY_RATE)}
                <span className={styles.rateUnit}> / hour</span>
              </p>
              <p className={styles.rateNote}>
                Fixed ShiftSupport rate. It is the same on every shift and is set when
                your shift is posted.
              </p>
            </div>

            <SubmitButton pendingLabel="Posting your shift…">
              Post shift <span aria-hidden="true">→</span>
            </SubmitButton>
          </FormGrid>
        </form>
      </Panel>

      <aside className={styles.summary}>
        <p className={styles.summaryTitle}>Shift summary</p>
        <p className={styles.summaryText}>
          This is what workers will see on the shift card.
        </p>

        <div className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Store</span>
            <span className={styles.summaryValue}>{storeName}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Task</span>
            <span className={styles.summaryValue}>{taskType || "—"}</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.locationRow}`}>
            <span className={styles.summaryLabel}>📍 Location</span>
            <span className={styles.summaryValue}>{shiftLocation || "—"}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Date</span>
            <span className={styles.summaryValue}>
              {date ? formatDate(`${date}T00:00:00`) : "—"}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Time</span>
            <span className={styles.summaryValue}>
              {startTime && endTime ? `${startTime} – ${endTime}` : "—"}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Duration</span>
            <span className={styles.summaryValue}>
              {duration ? formatDuration(duration) : "—"}
              {overnight && duration ? " (overnight)" : ""}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Rate</span>
            <span className={styles.summaryValue}>
              {`${formatUsd(RETAILER_HOURLY_RATE)}/hr`}
            </span>
          </div>
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>Estimated cost</span>
          <span className={styles.totalValue}>
            {total === null ? "—" : formatUsd(total, true)}
          </span>
        </div>

        <ul className={styles.tips}>
          <li>Shifts posted a few days ahead attract the most applicants.</li>
          <li>
            Every shift is charged at the fixed {formatUsd(RETAILER_HOURLY_RATE)}/hr
            ShiftSupport rate, so there is no rate to negotiate.
          </li>
          <li>
            Your store phone number stays private until you hire someone for the shift.
          </li>
        </ul>
      </aside>
    </div>
  );
}
