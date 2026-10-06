"use client";

import { useActionState, useMemo, useState } from "react";
import { createShift } from "@/app/actions/shifts";
import {
  Alert,
  FormGrid,
  FormRow,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import { Panel } from "@/components/ui/Kit";
import { IconCheck } from "@/components/dashboard/Icons";
import { formatDate, formatDuration } from "@/lib/format";
import { RETAILER_HOURLY_RATE, priceShift, shiftWindow } from "@/lib/pricing";
import {
  DEFAULT_SERIES_WEEKS,
  MAX_SERIES_WEEKS,
  WEEKDAYS,
  describeDays,
  estimateSeries,
  normaliseDays,
  occurrenceDates,
} from "@/lib/recurrence";
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

type ShiftType = "one-time" | "recurring";

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
  const [shiftType, setShiftType] = useState<ShiftType>(
    state.values?.shiftType === "recurring" ? "recurring" : "one-time",
  );
  const [repeatDays, setRepeatDays] = useState<number[]>(() =>
    normaliseDays((state.values?.repeatDays ?? "").split(",")),
  );
  const [weeks, setWeeks] = useState(
    Number(state.values?.weeks) || DEFAULT_SERIES_WEEKS,
  );
  const recurring = shiftType === "recurring";

  const toggleDay = (iso: number) =>
    setRepeatDays((days) =>
      days.includes(iso) ? days.filter((d) => d !== iso) : normaliseDays([...days, iso]),
    );

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

  // Recurring: how many dates the series schedules, and what they add up to at
  // the same per-shift price. Display only — each date is paid for separately.
  const series = useMemo(() => {
    if (!recurring) return null;
    const dates = date && repeatDays.length ? occurrenceDates(date, repeatDays, weeks) : [];
    const estimate = duration ? estimateSeries(duration, dates.length) : null;
    return { dates, estimate };
  }, [recurring, date, repeatDays, weeks, duration]);

  if (state.success) {
    return (
      <Panel>
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <IconCheck width={28} height={28} />
          </span>
          <h3 className={styles.successTitle}>Your shift is saved as a draft</h3>
          <p className={styles.successText}>
            Your shift has been saved as a draft. Complete payment to publish it to
            eligible workers.
          </p>
          <div className={styles.successActions}>
            <a
              className={buttonClass("primary")}
              href={`/retailer/shifts/${state.success}/payment`}
            >
              Continue to payment
            </a>
            <a className={buttonClass("ghost")} href="/retailer/shifts">
              View my shifts
            </a>
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

            <fieldset className={styles.typeField}>
              <legend className={styles.typeLegend}>Shift type</legend>
              <input type="hidden" name="shiftType" value={shiftType} />
              <div className={styles.typeOptions}>
                {(
                  [
                    ["one-time", "One-time shift", "A single date."],
                    ["recurring", "Recurring shift", "Repeats every week — keep the same worker."],
                  ] as const
                ).map(([value, label, help]) => (
                  <label
                    key={value}
                    className={`${styles.typeOption} ${
                      shiftType === value ? styles.typeOptionActive : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="shiftTypeChoice"
                      value={value}
                      checked={shiftType === value}
                      onChange={() => setShiftType(value)}
                      className={styles.typeRadio}
                    />
                    <span className={styles.typeText}>
                      <span className={styles.typeLabel}>{label}</span>
                      <span className={styles.typeHelp}>{help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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

            {recurring ? (
              <div className={styles.repeatField}>
                <span className={styles.repeatLabel} id="repeat-days-label">
                  Repeat on
                </span>
                <div
                  className={styles.dayPicker}
                  role="group"
                  aria-labelledby="repeat-days-label"
                >
                  {WEEKDAYS.map((day) => {
                    const on = repeatDays.includes(day.iso);
                    return (
                      <label
                        key={day.iso}
                        className={`${styles.dayChip} ${on ? styles.dayChipOn : ""}`}
                        title={day.long}
                      >
                        <input
                          type="checkbox"
                          name="repeatDays"
                          value={day.iso}
                          checked={on}
                          onChange={() => toggleDay(day.iso)}
                          className={styles.dayInput}
                        />
                        {day.short}
                      </label>
                    );
                  })}
                </div>
                {state.fieldErrors?.repeatDays ? (
                  <span className={styles.repeatError} role="alert">
                    {state.fieldErrors.repeatDays}
                  </span>
                ) : (
                  <span className={styles.repeatHint}>
                    {repeatDays.length
                      ? `${describeDays(repeatDays)}, at the times below.`
                      : "Pick one or more days."}
                  </span>
                )}
              </div>
            ) : null}

            <Input
              label={recurring ? "Starts on" : "Date"}
              name="date"
              type="date"
              min={today()}
              hint={recurring ? "The first week of the series." : undefined}
              defaultValue={state.values?.date}
              error={state.fieldErrors?.date}
              onChange={(e) => setDate(e.target.value)}
              required
            />

            {recurring ? (
              <Select
                label="Schedule for"
                name="weeks"
                value={String(weeks)}
                hint="Each date becomes its own shift that you pay for and publish separately."
                error={state.fieldErrors?.weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              >
                {Array.from({ length: MAX_SERIES_WEEKS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} week{n === 1 ? "" : "s"}
                  </option>
                ))}
              </Select>
            ) : null}

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

            <SubmitButton
              pendingLabel={recurring ? "Creating your recurring shift…" : "Posting your shift…"}
            >
              {recurring ? "Create recurring shift" : "Post shift"}{" "}
              <span aria-hidden="true">→</span>
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
            <span className={styles.summaryLabel}>Shift type</span>
            <span className={styles.summaryValue}>
              {recurring ? "Recurring" : "One-time"}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Task</span>
            <span className={styles.summaryValue}>{taskType || "—"}</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.locationRow}`}>
            <span className={styles.summaryLabel}>📍 Location</span>
            <span className={styles.summaryValue}>{shiftLocation || "—"}</span>
          </div>
          {recurring ? (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Repeats</span>
              <span className={styles.summaryValue}>
                {repeatDays.length ? describeDays(repeatDays) : "—"}
              </span>
            </div>
          ) : null}
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{recurring ? "Starts" : "Date"}</span>
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
          {series ? (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Dates scheduled</span>
              <span className={styles.summaryValue}>
                {series.dates.length ? series.dates.length : "—"}
              </span>
            </div>
          ) : null}
        </div>

        <div className={styles.total}>
          <span className={styles.totalLabel}>
            {recurring ? "Estimated cost per date" : "Estimated cost"}
          </span>
          <span className={styles.totalValue}>
            {total === null ? "—" : formatUsd(total, true)}
          </span>
        </div>

        {series?.estimate && series.dates.length > 0 ? (
          <div className={styles.seriesTotal}>
            <span className={styles.seriesTotalLabel}>
              {series.dates.length} date{series.dates.length === 1 ? "" : "s"} ×{" "}
              {formatUsd(series.estimate.perOccurrence, true)}
            </span>
            <span className={styles.seriesTotalValue}>
              {formatUsd(series.estimate.total, true)}
            </span>
            <span className={styles.seriesTotalNote}>
              Shown for planning only. Nothing is charged automatically — each date is
              paid for separately when you publish it.
            </span>
          </div>
        ) : null}

        <ul className={styles.tips}>
          {recurring ? (
            <li>
              The worker you hire for a recurring shift is kept on its upcoming dates, so you
              get the same person every week.
            </li>
          ) : null}
          <li>Shifts posted a few days ahead attract the most applicants.</li>
          <li>
            Your shift is published once payment is confirmed. You&apos;ll review it before
            choosing whether to continue to secure Stripe checkout.
          </li>
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
