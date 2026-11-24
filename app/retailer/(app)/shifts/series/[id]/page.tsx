import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, MetaList, MetaRow, PageHeader, Panel } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";
import { SHIFT_STATUS_LABEL, SHIFT_STATUS_TONE } from "@/components/shifts/ShiftCard";
import {
  IconCalendar,
  IconCash,
  IconClock,
  IconPin,
  IconUsers,
} from "@/components/dashboard/Icons";
import { requireRetailer } from "@/lib/auth/session";
import { getHiredWorkerContacts } from "@/lib/data/retailer";
import { getSeriesDetail, getWorkerName } from "@/lib/data/series";
import { formatDate, formatDuration, formatMoney, formatTime, isPast } from "@/lib/format";
import { priceShift, RETAILER_HOURLY_RATE } from "@/lib/pricing";
import { clockTime, describeDays } from "@/lib/recurrence";
import CancelShiftButton from "../../ShiftActions";
import { SERIES_STATUS_LABEL } from "../seriesSummary";
import styles from "../series.module.css";

export const metadata: Metadata = { title: "Recurring shift | ShiftSupport" };

/**
 * One recurring series: its schedule, the worker it keeps, and every date.
 */
export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireRetailer();
  const { id } = await params;

  const series = await getSeriesDetail(id, store.id);
  if (!series) notFound();

  const bookedIds = series.occurrences.filter((s) => s.accepted_by).map((s) => s.id);
  const [keptWorkerName, contacts] = await Promise.all([
    getWorkerName(series.assigned_worker_id),
    getHiredWorkerContacts(bookedIds),
  ]);

  const scheduled = series.occurrences.filter((s) => s.status !== "cancelled");
  const priceOf = (hours: number) => priceShift(Number(hours) || 0).retailerTotal;
  const scheduledTotal = scheduled.reduce((sum, s) => sum + priceOf(s.duration), 0);

  const sample = series.occurrences[0];
  const hoursPerDate = sample ? Number(sample.duration) || 0 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Recurring shift"
        title={series.task_type}
        description={`${describeDays(series.days_of_week)} · ${clockTime(series.start_time)} – ${clockTime(series.end_time)}`}
        actions={
          <a className={buttonClass("ghost")} href="/retailer/shifts">
            Back to my shifts
          </a>
        }
      />

      <div className={styles.stack}>
        <div className={styles.columns}>
          <Panel title="Schedule">
            <MetaList>
              <MetaRow
                icon={<IconCalendar width={16} height={16} />}
                label="Repeats"
                value={
                  <>
                    {describeDays(series.days_of_week)}{" "}
                    <Badge tone={series.status === "active" ? "open" : "neutral"}>
                      {SERIES_STATUS_LABEL[series.status] ?? series.status}
                    </Badge>
                  </>
                }
              />
              <MetaRow
                icon={<IconClock width={16} height={16} />}
                label="Time"
                value={`${clockTime(series.start_time)} – ${clockTime(series.end_time)}${
                  hoursPerDate ? ` · ${formatDuration(hoursPerDate)}` : ""
                }`}
              />
              <MetaRow
                icon={<IconCalendar width={16} height={16} />}
                label="Runs"
                value={`${formatDate(series.starts_on)}${
                  series.ends_on ? ` – ${formatDate(series.ends_on)}` : ""
                }`}
              />
              <MetaRow
                icon={<IconPin width={16} height={16} />}
                label="Location"
                value={series.shift_location ?? store.address ?? "—"}
              />
              <MetaRow
                icon={<IconUsers width={16} height={16} />}
                label="Recurring worker"
                value={
                  series.assigned_worker_id
                    ? `${keptWorkerName ?? "Your hired worker"} — kept on every upcoming date`
                    : "Not hired yet. The first worker you hire is kept on the upcoming dates."
                }
              />
            </MetaList>
          </Panel>

          <Panel title="Pricing" description="Every date is priced like a one-time shift.">
            <dl className={styles.pricing}>
              <div>
                <dt>Per date</dt>
                <dd>
                  {formatDuration(hoursPerDate)} × {formatMoney(RETAILER_HOURLY_RATE)}/hour ={" "}
                  {formatMoney(priceOf(hoursPerDate))}
                </dd>
              </div>
              <div className={styles.pricingTotal}>
                <dt>
                  {scheduled.length} scheduled date{scheduled.length === 1 ? "" : "s"}
                </dt>
                <dd>{formatMoney(scheduledTotal)}</dd>
              </div>
            </dl>
            <p className={styles.pricingNote}>
              Estimated figures based on scheduled duration. Each completed shift is invoiced
              based on actual approved hours worked.
            </p>
          </Panel>
        </div>

        <Panel
          title="Dates"
          description="Each date can be managed, cancelled or reviewed on its own without affecting the rest of the series."
          flush
        >
          <ul className={styles.dates}>
            {series.occurrences.map((shift) => {
              const past = isPast(shift.end_time);
              const cancelled = shift.status === "cancelled";
              const worker = shift.accepted_by
                ? contacts.get(shift.id)?.worker_name ??
                  (shift.accepted_by === series.assigned_worker_id ? keptWorkerName : null)
                : null;
              const statusLabel =
                past && !cancelled && shift.status !== "completed"
                  ? "Finished"
                  : SHIFT_STATUS_LABEL[shift.status] ?? shift.status;

              return (
                <li
                  key={shift.id}
                  className={`${styles.dateRow} ${past || cancelled ? styles.dateRowMuted : ""}`}
                >
                  <div className={styles.dateMain}>
                    <p className={styles.dateTitle}>{formatDate(shift.start_time)}</p>
                    <p className={styles.dateMeta}>
                      {formatTime(shift.start_time)} – {formatTime(shift.end_time)} ·{" "}
                      {formatMoney(priceOf(shift.duration))}
                    </p>
                    {shift.accepted_by ? (
                      <p className={styles.dateWorker}>
                        {shift.accepted_by === series.assigned_worker_id
                          ? `Recurring worker: ${worker ?? "booked"}`
                          : `Covered by ${worker ?? "another worker"}`}
                      </p>
                    ) : null}
                  </div>

                  <div className={styles.dateSide}>
                    <Badge
                      tone={
                        past && !cancelled && shift.status !== "completed"
                          ? "neutral"
                          : SHIFT_STATUS_TONE[shift.status] ?? "neutral"
                      }
                    >
                      {statusLabel}
                    </Badge>
                    <div className={styles.dateActions}>
                      {shift.status === "open" && !shift.accepted_by ? (
                        <a
                          className={buttonClass("ghost", { small: true })}
                          href={`/retailer/applicants?shift=${shift.id}`}
                        >
                          Applicants
                        </a>
                      ) : null}
                      <a
                        className={buttonClass("ghost", { small: true })}
                        href={`/retailer/shifts/${shift.id}/payment`}
                      >
                        {shift.payment_status === "paid" ? "Receipt" : "Summary"}
                      </a>
                      {!cancelled && !past ? (
                        <CancelShiftButton shiftId={shift.id} label="Cancel this date" />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
