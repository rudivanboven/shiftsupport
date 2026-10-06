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
import PayShiftButton from "../../[id]/payment/PayShiftButton";
import { SERIES_STATUS_LABEL, summariseSeries } from "../seriesSummary";
import styles from "../series.module.css";

export const metadata: Metadata = { title: "Recurring shift | ShiftSupport" };

const PAYMENT_LABEL: Record<string, string> = {
  paid: "Paid",
  legacy: "No online payment",
  pending: "Confirming payment",
  failed: "Payment failed",
  unpaid: "Unpaid",
};

/**
 * One recurring series: its schedule, the worker it keeps, and every date.
 *
 * Each date is an ordinary shift with its own payment, so this page reuses
 * the existing per-shift "Pay & publish" button and receipt page. The totals
 * here add up per-date prices for planning; nothing is charged from this page
 * except through that same per-date checkout.
 */
export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireRetailer();
  const { id } = await params;

  const series = await getSeriesDetail(id, store.id);
  if (!series) notFound();

  const summary = summariseSeries(series);
  const bookedIds = series.occurrences.filter((s) => s.accepted_by).map((s) => s.id);
  const [keptWorkerName, contacts] = await Promise.all([
    getWorkerName(series.assigned_worker_id),
    getHiredWorkerContacts(bookedIds),
  ]);

  const scheduled = series.occurrences.filter((s) => s.status !== "cancelled");
  const priceOf = (hours: number) => priceShift(Number(hours) || 0).retailerTotal;
  const scheduledTotal = scheduled.reduce((sum, s) => sum + priceOf(s.duration), 0);
  const paidTotal =
    scheduled
      .filter((s) => s.payment_status === "paid")
      .reduce((sum, s) => sum + (s.amount_paid_cents ?? 0), 0) / 100;
  const unpaid = scheduled.filter((s) => s.status === "draft");
  const unpaidTotal = unpaid.reduce((sum, s) => sum + priceOf(s.duration), 0);

  const sample = series.occurrences[0];
  const hoursPerDate = sample ? Number(sample.duration) || 0 : 0;
  const nextToPay = summary.awaitingPayment[0] ?? null;

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
        {nextToPay ? (
          <Panel title="Publish your dates">
            <div className={styles.callout}>
              <p className={styles.calloutText}>
                {summary.awaitingPayment.length} upcoming date
                {summary.awaitingPayment.length === 1 ? " is" : "s are"} saved as{" "}
                {summary.awaitingPayment.length === 1 ? "a draft" : "drafts"}. Each date is paid
                for separately through the usual secure checkout, and is published to workers —
                or booked straight onto your recurring worker — once its payment is confirmed.
                Nothing is charged automatically.
              </p>
              <div className={styles.calloutActions}>
                <PayShiftButton
                  shiftId={nextToPay.id}
                  label={`Pay & publish ${formatDate(nextToPay.start_time)}`}
                />
              </div>
            </div>
          </Panel>
        ) : null}

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
              <div>
                <dt>
                  {scheduled.length} scheduled date{scheduled.length === 1 ? "" : "s"}
                </dt>
                <dd>{formatMoney(scheduledTotal)}</dd>
              </div>
              <div>
                <dt>Paid so far</dt>
                <dd>{formatMoney(paidTotal)}</dd>
              </div>
              <div className={styles.pricingTotal}>
                <dt>
                  Still to pay ({unpaid.length} date{unpaid.length === 1 ? "" : "s"})
                </dt>
                <dd>{formatMoney(unpaidTotal)}</dd>
              </div>
            </dl>
            <p className={styles.pricingNote}>
              Planning figures only. You pay for each date individually when you publish it;
              there is no subscription and no automatic charge.
            </p>
          </Panel>
        </div>

        <Panel
          title="Dates"
          description="Each date can be paid for, cancelled or reviewed on its own without affecting the rest of the series."
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
                      {formatMoney(priceOf(shift.duration))} ·{" "}
                      {PAYMENT_LABEL[shift.payment_status ?? "unpaid"] ?? shift.payment_status}
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
                      {shift.status === "draft" && !past ? (
                        <PayShiftButton
                          shiftId={shift.id}
                          label="Pay & publish"
                          variant="primary"
                          small
                        />
                      ) : null}
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
