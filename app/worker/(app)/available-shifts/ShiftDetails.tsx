"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconClose } from "@/components/dashboard/Icons";
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatRate,
  formatTime,
  totalPay,
} from "@/lib/format";
import type { Shift } from "@/lib/supabase/types";
import styles from "./details.module.css";

export default function ShiftDetails({
  shift,
  storeName,
  storeAddress,
}: {
  shift: Shift;
  storeName: string;
  storeAddress: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pay = totalPay(shift.hourly_rate, shift.duration);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows: [string, string][] = [
    ["Store", storeName],
    ["Location", storeAddress ?? "Address not provided"],
    ["Task", shift.task_type],
    ["Date", formatDate(shift.start_time)],
    ["Start", formatTime(shift.start_time)],
    ["End", formatTime(shift.end_time)],
    ["Duration", formatDuration(shift.duration)],
    ["Hourly rate", formatRate(shift.hourly_rate)],
    ["Estimated total", pay === null ? "To be confirmed" : formatMoney(pay)],
  ];

  return (
    <>
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setOpen(true)}
      >
        View details
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Shift details">
            <div className={styles.dialogHead}>
              <div>
                <p className={styles.dialogEyebrow}>Shift details</p>
                <h2 className={styles.dialogTitle}>{shift.task_type}</h2>
              </div>
              <button
                type="button"
                className={styles.dialogClose}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            {shift.description ? (
              <p className={styles.dialogText}>{shift.description}</p>
            ) : null}

            <dl className={styles.dialogList}>
              {rows.map(([label, value]) => (
                <div key={label} className={styles.dialogRow}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <p className={styles.dialogNote}>
              The store&apos;s phone number is shared with you as soon as you&apos;re
              hired for this shift.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
