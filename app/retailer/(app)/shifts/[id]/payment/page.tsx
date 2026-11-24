import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge, MetaList, MetaRow, PageHeader, Panel } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";
import {
  IconCalendar,
  IconCash,
  IconClock,
  IconPin,
  IconStore,
} from "@/components/dashboard/Icons";
import { requireRetailer } from "@/lib/auth/session";
import { getShiftPayment } from "@/lib/data/retailer";
import { getSeriesForShifts } from "@/lib/data/series";
import { describeDays } from "@/lib/recurrence";
import { formatDate, formatDuration, formatMoney, formatTime } from "@/lib/format";
import { priceShift, RETAILER_HOURLY_RATE } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { Shift } from "@/lib/supabase/types";
import styles from "./payment.module.css";

export const metadata: Metadata = { title: "Shift summary | ShiftSupport" };

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : formatMoney(cents / 100);

/**
 * Shift summary and historical receipt for one shift.
 *
 * Stripe Checkout is no longer required to publish shifts. Any historical
 * payment rows in `shift_payments` remain readable for shifts paid before
 * Stripe checkout was retired.
 */
export default async function ShiftPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requireRetailer();
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("shifts")
    .select(
      "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at,payment_status,amount_paid_cents,paid_at,published_at",
    )
    .eq("id", id)
    .maybeSingle();

  const shift = data as Shift | null;
  if (!shift || shift.store_id !== store.id) notFound();

  const [{ payment }, seriesByShift] = await Promise.all([
    getShiftPayment(shift.id),
    getSeriesForShifts([shift.id]),
  ]);
  const series = seriesByShift.get(shift.id) ?? null;
  const bookedForSeries = Boolean(
    series?.assigned_worker_id && shift.accepted_by === series.assigned_worker_id,
  );

  const hours = Number(shift.duration) || 0;
  const expected = priceShift(hours);
  const paid = shift.payment_status === "paid";
  const cancelled = shift.status === "cancelled";

  const statusBadge = paid
    ? { tone: "approved" as const, label: "Paid (historical)" }
    : cancelled
      ? { tone: "cancelled" as const, label: "Cancelled" }
      : shift.status === "completed"
        ? { tone: "approved" as const, label: "Completed · Invoiced on approved hours" }
        : { tone: "open" as const, label: "Published · Billed after completion" };

  return (
    <>
      <PageHeader
        eyebrow="Shift summary"
        title={shift.task_type}
        description={
          paid
            ? bookedForSeries
              ? "Historical payment confirmed. This date is booked for your recurring worker."
              : "Historical payment confirmed for this shift."
            : cancelled
              ? "This shift was cancelled."
              : "Your shift is published to eligible workers. Retailers are invoiced for actual approved hours once the shift is completed."
        }
        actions={
          series ? (
            <a className={buttonClass("ghost")} href={`/retailer/shifts/series/${series.id}`}>
              Back to recurring shift
            </a>
          ) : (
            <a className={buttonClass("ghost")} href="/retailer/shifts">
              Back to my shifts
            </a>
          )
        }
      />

      <div className={styles.stack}>
        <Panel title="Billing status">
          <div className={styles.status}>
            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>

            {paid ? (
              <p className={styles.statusText}>
                Payment confirmed{payment?.paid_at ? ` on ${formatDate(payment.paid_at)}` : ""}.
                {bookedForSeries
                  ? " This date is booked for your recurring worker."
                  : " Your shift is published and eligible workers can apply."}
              </p>
            ) : cancelled ? (
              <p className={styles.statusText}>
                This shift was cancelled, so no invoice is issued.
              </p>
            ) : (
              <>
                <p className={styles.statusText}>
                  No upfront payment is required to publish a shift. ShiftSupport issues a
                  retailer invoice after the shift is completed and actual hours worked are
                  approved.
                </p>
                <p className={styles.statusAmount}>
                  <span>Estimated shift cost</span>
                  <strong>{formatMoney(expected.retailerTotal)}</strong>
                  <small>
                    {formatDuration(hours)} × {formatMoney(RETAILER_HOURLY_RATE)}/hour
                  </small>
                </p>
              </>
            )}
          </div>
        </Panel>

        <Panel title="Shift" description="What was booked.">
          <MetaList>
            <MetaRow
              icon={<IconStore width={16} height={16} />}
              label="Store"
              value={store.name}
            />
            <MetaRow
              icon={<IconCalendar width={16} height={16} />}
              label="Date"
              value={formatDate(shift.start_time)}
            />
            {series ? (
              <MetaRow
                icon={<IconCalendar width={16} height={16} />}
                label="Recurring shift"
                value={describeDays(series.days_of_week)}
              />
            ) : null}
            <MetaRow
              icon={<IconClock width={16} height={16} />}
              label="Time"
              value={`${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} · ${formatDuration(hours)}`}
            />
            <MetaRow
              icon={<IconPin width={16} height={16} />}
              label="Location"
              value={shift.shift_location ?? store.address ?? "—"}
            />
            <MetaRow
              icon={<IconCash width={16} height={16} />}
              label="Retailer rate"
              value={`${formatMoney(shift.hourly_rate ?? RETAILER_HOURLY_RATE)}/hour`}
            />
          </MetaList>
        </Panel>

        <Panel
          title={paid ? "Receipt" : "Shift cost summary"}
          description={
            paid
              ? "Historical payment confirmed for this shift."
              : "Estimated cost based on scheduled shift duration."
          }
        >
          <div className={styles.receipt}>
            <dl className={styles.receiptList}>
              <div>
                <dt>Scheduled duration</dt>
                <dd>{formatDuration(hours)}</dd>
              </div>
              <div>
                <dt>Retailer rate</dt>
                <dd>{formatMoney(shift.hourly_rate ?? RETAILER_HOURLY_RATE)}/hour</dd>
              </div>
              <div className={styles.receiptTotal}>
                <dt>{paid ? "Total paid" : "Estimated total"}</dt>
                <dd>
                  {paid
                    ? money(payment?.amount_cents ?? shift.amount_paid_cents) ?? "—"
                    : formatMoney(expected.retailerTotal)}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusBadge.label}</dd>
              </div>
              {payment?.paid_at ? (
                <div>
                  <dt>Paid on</dt>
                  <dd>{formatDate(payment.paid_at)}</dd>
                </div>
              ) : null}
            </dl>

            {!paid ? (
              <p className={styles.receiptNote}>
                Final retailer invoice amount is calculated from actual approved hours worked
                after the shift is completed.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
