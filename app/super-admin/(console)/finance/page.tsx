import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import {
  BarTrend,
  Metric,
  Metrics,
  Notice,
  Pagination,
  RangeFilter,
  Section,
  hours as hoursText,
  money,
  paginate,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { instantInRange, parseRange } from "@/lib/admin/dates";
import { moneyTotals, paidPayments, paymentSplit, rangeMetrics, summarise } from "@/lib/admin/metrics";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, workerContact } from "@/lib/admin/snapshot";
import { formatDate, formatDateTime } from "@/lib/format";
import { PLATFORM_HOURLY_PORTION, RETAILER_HOURLY_RATE, WORKER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Finance | Operations Control Center" };

const PATH = "/super-admin/finance";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; page?: string; view?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const range = parseRange(params, "30d");
  const snapshot = await loadSnapshot();
  const s = summarise(snapshot);
  const r = rangeMetrics(snapshot, range);

  const paid = paidPayments(snapshot);
  const inRange = paid.filter((p) => instantInRange(p.paid_at, range)).sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
  const totals = moneyTotals(inRange);
  const pending = snapshot.payments.filter((p) => p.status === "pending");

  const { page, pageCount, rows } = paginate(inRange, params.page, PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Financial control centre"
        description={`Retailers pay $${RETAILER_HOURLY_RATE}/hour: $${WORKER_HOURLY_RATE}/hour worker gross and $${PLATFORM_HOURLY_PORTION}/hour ShiftSupport platform portion, which supports employment administration, insurance, compliance, payroll-related operations and platform services.`}
      />

      <Notice tone="info">
        <p>
          Every amount here comes from a Stripe-confirmed payment in <code>shift_payments</code>. Unpaid and draft shifts are
          never counted as money received. Worker gross and platform portion are the split recorded at checkout, from
          <strong> scheduled</strong> hours; where actual hours have been approved, the payroll figure is shown from those instead.
        </p>
      </Notice>

      <RangeFilter path={PATH} params={params} range={range} allowAll />

      <Section
        title={`Selected period — ${range.label}`}
        subtitle="Stripe-confirmed retailer payments inside the period above."
        tone="finance"
      >
        <Metrics>
          <Metric label="Retailer payments" value={money(totals.amountCents)} hint={`${totals.count} paid shift${totals.count === 1 ? "" : "s"}`} />
          <Metric label="Worker gross represented" value={money(totals.workerGrossCents)} hint={`$${WORKER_HOURLY_RATE}/hour`} />
          <Metric label="Platform portion" value={money(totals.platformCents)} hint={`$${PLATFORM_HOURLY_PORTION}/hour`} />
          <Metric label="Paid shift count" value={totals.count} />
        </Metrics>
      </Section>

      <Section
        title="Fixed windows"
        subtitle="Today, the last 7 and 30 days, and all-time totals — independent of the filter above."
        tone="neutral"
      >
        <Metrics>
          <Metric label="Today" value={money(s.finance.today.amountCents)} hint={`${s.finance.today.count} paid`} />
          <Metric label="Last 7 days" value={money(s.finance.last7.amountCents)} hint={`${s.finance.last7.count} paid`} />
          <Metric label="Last 30 days" value={money(s.finance.last30.amountCents)} hint={`${s.finance.last30.count} paid`} />
          <Metric label="Total paid volume" value={money(s.finance.allTime.amountCents)} hint={`${s.finance.allTime.count} paid shifts, all time`} />
          <Metric label="Completed paid shifts" value={s.finance.completedPaidShifts} hint="Paid and confirmed completed" />
          <Metric label="Pending payments" value={money(s.finance.pendingCents)} hint={`${s.finance.pendingCount} open checkout${s.finance.pendingCount === 1 ? "" : "s"} — not revenue`} />
          <Metric label="Pre-Stripe shifts" value={s.finance.legacyShifts} hint="No payment record exists" />
        </Metrics>
      </Section>

      <Panel title="Payment volume" description="Stripe-confirmed retailer payments per day in the selected period.">
        <div className={styles.charts}>
          <BarTrend title="Retailer payment volume" buckets={r.charts.revenue} format={(v) => money(Math.round(v * 100))} />
        </div>
      </Panel>

      <div className={styles.spacer} aria-hidden="true" />

      <Panel
        title={`Transactions — ${range.label}`}
        description="Drill-down on individual paid shifts, with the Stripe reference for each."
        flush
      >
        {rows.length === 0 ? (
          <EmptyState title="No payments in this period" text="Choose a wider period, or check pending checkouts below." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paid at</th>
                    <th>Store</th>
                    <th>Shift</th>
                    <th>Worker</th>
                    <th className={styles.num}>Scheduled</th>
                    <th className={styles.num}>Approved</th>
                    <th className={styles.num}>Rate</th>
                    <th className={styles.num}>Retailer amount</th>
                    <th className={styles.num}>Worker gross</th>
                    <th className={styles.num}>Platform</th>
                    <th>Stripe reference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((payment) => {
                    const shift = snapshot.shiftById.get(payment.shift_id);
                    const store = snapshot.storeById.get(payment.store_id);
                    const worker = shift?.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
                    const entry = shift ? snapshot.entryByShift.get(shift.id) : undefined;
                    const approved = entry?.approval_status === "approved" ? entry.approved_hours : null;
                    const split = paymentSplit(payment);
                    const workerGross = approved ? Math.round(approved * WORKER_HOURLY_RATE * 100) : split.workerGross;
                    const platform = approved ? Math.round(approved * PLATFORM_HOURLY_PORTION * 100) : split.platform;

                    return (
                      <tr key={payment.id}>
                        <td className={styles.nowrap}>{payment.paid_at ? formatDateTime(payment.paid_at) : "—"}</td>
                        <td>
                          {store ? (
                            <Link className={styles.primaryCell} href={`/super-admin/retailers/${store.id}`}>
                              {store.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {shift ? (
                            <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                              {shift.task_type}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {shift ? <span className={styles.sub}>{formatDate(shift.start_time)}</span> : null}
                        </td>
                        <td>
                          {worker ? (
                            <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>
                              {workerContact(snapshot, worker).name ?? "Worker"}
                            </Link>
                          ) : (
                            "Not hired"
                          )}
                        </td>
                        <td className={styles.num}>{hoursText(payment.hours ?? shift?.duration ?? null)}</td>
                        <td className={styles.num}>{hoursText(approved)}</td>
                        <td className={styles.num}>${payment.hourly_rate ?? RETAILER_HOURLY_RATE}/h</td>
                        <td className={styles.num}>{money(split.amount)}</td>
                        <td className={styles.num}>
                          {money(workerGross)}
                          {approved ? <span className={styles.sub}>approved</span> : <span className={styles.sub}>scheduled</span>}
                        </td>
                        <td className={styles.num}>{money(platform)}</td>
                        <td>
                          <span className={styles.mono}>{payment.stripe_payment_intent_id ?? payment.stripe_checkout_session_id}</span>
                          <span className={styles.sub}>
                            <Badge tone="approved">paid</Badge>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={inRange.length} />
          </>
        )}
      </Panel>

      <div className={styles.spacer} aria-hidden="true" />

      <Panel title="Open checkouts" description="Started but not completed. These are not revenue." flush>
        {pending.length === 0 ? (
          <EmptyState title="No open checkouts" text="Every started checkout has either completed or expired." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Store</th>
                  <th>Shift</th>
                  <th className={styles.num}>Amount</th>
                  <th>Checkout session</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((payment) => {
                  const shift = snapshot.shiftById.get(payment.shift_id);
                  const store = snapshot.storeById.get(payment.store_id);
                  return (
                    <tr key={payment.id}>
                      <td className={styles.nowrap}>{formatDateTime(payment.created_at)}</td>
                      <td>{store?.name ?? "—"}</td>
                      <td>
                        {shift ? (
                          <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                            {shift.task_type}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={styles.num}>{money(payment.amount_cents)}</td>
                      <td>
                        <span className={styles.mono}>{payment.stripe_checkout_session_id}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
