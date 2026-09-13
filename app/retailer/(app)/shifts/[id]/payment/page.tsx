import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { syncShiftPayment } from "@/app/actions/billing";
import { ConfirmingPoller } from "@/components/pricing/MembershipActions";
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
import { formatDate, formatDuration, formatMoney, formatTime } from "@/lib/format";
import { priceShift, RETAILER_HOURLY_RATE } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { Shift } from "@/lib/supabase/types";
import PayButton from "./PayShiftButton";
import styles from "./payment.module.css";

export const metadata: Metadata = { title: "Shift payment | ShiftSupport" };

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : formatMoney(cents / 100);

/**
 * Payment status and receipt for one shift.
 *
 * Everything money-related on this page comes from the `shift_payments` row,
 * which is written only by Stripe-verified fulfillment. When there is no
 * confirmed payment yet, the page says so — it never presents an expected
 * amount as if it had been charged.
 */
export default async function ShiftPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string; canceled?: string }>;
}) {
  const { store } = await requireRetailer();
  const { id } = await params;
  const query = await searchParams;

  // Coming back from Checkout: ask Stripe what happened. `session_id` only
  // says which session to look up — Stripe's answer is what counts.
  if (query.session_id) await syncShiftPayment(id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("shifts")
    .select(
      "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at,payment_status,amount_paid_cents,paid_at,published_at",
    )
    .eq("id", id)
    .maybeSingle();

  const shift = data as Shift | null;
  // RLS already limits this to the caller's own store; this is the second lock.
  if (!shift || shift.store_id !== store.id) notFound();

  const { payment } = await getShiftPayment(shift.id);

  const hours = Number(shift.duration) || 0;
  const expected = priceShift(hours);
  const paid = shift.payment_status === "paid";
  const legacy = shift.payment_status === "legacy";
  const cancelled = shift.status === "cancelled";
  const confirming =
    !paid && (Boolean(query.session_id) || shift.payment_status === "pending");

  const statusBadge = paid
    ? { tone: "approved" as const, label: "Paid" }
    : legacy
      ? { tone: "neutral" as const, label: "Published before online payments" }
      : cancelled
        ? { tone: "cancelled" as const, label: "Cancelled" }
        : confirming
          ? { tone: "pending" as const, label: "Confirming…" }
          : { tone: "pending" as const, label: "Awaiting payment" };

  return (
    <>
      <PageHeader
        eyebrow="Shift payment"
        title={paid ? shift.task_type : "Your shift is ready for payment"}
        description={
          paid
            ? "This shift has been paid for and is live for workers."
            : legacy
              ? "This shift was posted before online payments were introduced."
              : "Your shift has been saved as a draft. Complete payment to publish it to eligible workers."
        }
        actions={
          <a className={buttonClass("ghost")} href="/retailer/shifts">
            Back to my shifts
          </a>
        }
      />

      <div className={styles.stack}>
        <Panel title="Payment status">
          <div className={styles.status}>
            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>

            {paid ? (
              <p className={styles.statusText}>
                Payment confirmed{payment?.paid_at ? ` on ${formatDate(payment.paid_at)}` : ""}.
                Your shift is published and eligible workers can apply.
              </p>
            ) : legacy ? (
              <p className={styles.statusText}>
                There is no online payment record for this shift because it predates
                Stripe checkout. Nothing is owed here.
              </p>
            ) : cancelled ? (
              <p className={styles.statusText}>
                This shift was cancelled, so no payment is due and it cannot be published.
              </p>
            ) : confirming ? (
              <>
                <p className={styles.statusText}>
                  Payment received — we&apos;re confirming it with Stripe. This page
                  updates itself, and your shift publishes as soon as the payment is
                  confirmed.
                </p>
                <ConfirmingPoller />
              </>
            ) : (
              <>
                <p className={styles.statusText}>
                  {query.canceled
                    ? "Checkout was cancelled, so nothing was charged and the shift was not published. You can pay for it whenever you're ready."
                    : "This shift is saved as a draft. Workers can't see it until the payment is complete."}
                </p>
                <p className={styles.statusAmount}>
                  <span>Amount due</span>
                  <strong>{formatMoney(expected.retailerTotal)}</strong>
                  <small>
                    {formatDuration(hours)} × {formatMoney(RETAILER_HOURLY_RATE)}/hour
                  </small>
                </p>
              </>
            )}

            {!paid && !legacy && !cancelled && !confirming ? (
              <div className={styles.statusActions}>
                <PayButton shiftId={shift.id} label="Continue to payment" />
              </div>
            ) : null}
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
          title={paid ? "Receipt" : "Shift summary"}
          description={
            paid
              ? "The amounts Stripe confirmed for this shift."
              : "What this shift will cost once it is paid for."
          }
        >
          <div className={styles.receipt}>
            <dl className={styles.receiptList}>
              <div>
                <dt>Shift duration</dt>
                <dd>{formatDuration(hours)}</dd>
              </div>
              <div>
                <dt>Retailer rate</dt>
                <dd>{formatMoney(shift.hourly_rate ?? RETAILER_HOURLY_RATE)}/hour</dd>
              </div>
              <div className={styles.receiptTotal}>
                <dt>{paid ? "Total paid" : "Total due"}</dt>
                <dd>
                  {paid
                    ? money(payment?.amount_cents ?? shift.amount_paid_cents) ?? "—"
                    : formatMoney(expected.retailerTotal)}
                </dd>
              </div>
              <div>
                <dt>Worker gross</dt>
                <dd>
                  {paid
                    ? money(payment?.worker_gross_cents) ?? formatMoney(expected.workerGross)
                    : formatMoney(expected.workerGross)}
                </dd>
              </div>
              <div>
                <dt>ShiftSupport platform portion</dt>
                <dd>
                  {paid
                    ? money(payment?.platform_portion_cents) ??
                      formatMoney(expected.platformPortion)
                    : formatMoney(expected.platformPortion)}
                </dd>
              </div>
              <div>
                <dt>Payment status</dt>
                <dd>{statusBadge.label}</dd>
              </div>
              {payment?.paid_at ? (
                <div>
                  <dt>Paid on</dt>
                  <dd>{formatDate(payment.paid_at)}</dd>
                </div>
              ) : null}
              {payment?.stripe_payment_intent_id ? (
                <div>
                  <dt>Stripe payment</dt>
                  <dd className={styles.reference}>{payment.stripe_payment_intent_id}</dd>
                </div>
              ) : null}
              {payment?.stripe_checkout_session_id ? (
                <div>
                  <dt>Checkout session</dt>
                  <dd className={styles.reference}>
                    {payment.stripe_checkout_session_id}
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className={styles.receiptNote}>
              The ShiftSupport platform portion supports applicable employment-related
              administration, insurance, compliance, payroll-related operations and
              platform services.
              {paid
                ? ""
                : " Amounts shown here are what this shift will cost — nothing has been charged yet."}
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
