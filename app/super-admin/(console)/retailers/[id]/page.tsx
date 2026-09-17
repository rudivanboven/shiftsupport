import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import { DefinitionList, Metric, Metrics, hours as hoursText, money } from "@/components/super-admin/ui";
import { PAYMENT_STATUS, SHIFT_STATUS } from "@/lib/admin/labels";
import { retailerRows } from "@/lib/admin/people";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, storeRating, workerContact } from "@/lib/admin/snapshot";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Retailer | Operations Control Center" };

export default async function RetailerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const { id } = await params;
  const snapshot = await loadSnapshot();
  const store = snapshot.storeById.get(id);
  if (!store) notFound();

  const row = retailerRows(snapshot).find((r) => r.storeId === id);
  if (!row) notFound();

  const shifts = (snapshot.shiftsByStore.get(id) ?? []).slice().sort((a, b) => b.start_time.localeCompare(a.start_time));
  const payments = snapshot.payments
    .filter((p) => p.store_id === id)
    .slice()
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at));
  const rating = storeRating(snapshot, id);
  const applications = shifts.flatMap((shift) => (snapshot.applicationsByShift.get(shift.id) ?? []).map((a) => ({ application: a, shift })));
  const pending = applications.filter(({ application }) => application.status === "pending").length;

  return (
    <>
      <Link href="/super-admin/retailers" className={styles.back}>
        ← Retailer directory
      </Link>

      <PageHeader
        eyebrow="Retailer"
        title={store.name}
        description={row.storeAddress ?? "No store address on file"}
        actions={
          <ContactActions
            target={{
              type: "retailer",
              id,
              name: store.name,
              email: row.contact.email,
              telHref: row.contact.telHref ?? row.storeContact.telHref,
              whatsappHref: row.contact.whatsappHref ?? row.storeContact.whatsappHref,
            }}
            subjectHint="ShiftSupport — about your store"
          />
        }
      />

      <Metrics tone="retailers">
        <Metric label="Shifts posted" value={row.shiftsPosted} />
        <Metric label="Paid" value={row.paidShifts} hint={`${row.draftShifts} awaiting payment`} />
        <Metric label="Open" value={row.openShifts} />
        <Metric label="Completed" value={row.completedShifts} />
        <Metric label="Total paid" value={money(row.paid.amountCents)} hint={`${row.paid.count} payments`} />
        <Metric label="Applicants" value={applications.length} hint={`${pending} pending`} />
        <Metric
          label="Store rating"
          value={row.ratingAverage === null ? "—" : row.ratingAverage.toFixed(1)}
          hint={`${row.ratingCount} worker review${row.ratingCount === 1 ? "" : "s"}`}
        />
      </Metrics>

      <div className={styles.detailGrid}>
        <Panel title="Store">
          <DefinitionList
            items={[
              ["Store name", store.name],
              ["Address", store.address ?? "—"],
              ["Store phone", store.contact_phone ?? "—"],
              ["Store created", store.created_at ? formatDateTime(store.created_at) : "—"],
              ["Store id", <span className={styles.mono}>{id}</span>],
            ]}
          />
        </Panel>

        <Panel title="Retailer contact">
          <DefinitionList
            items={[
              ["Contact name", row.contactName ?? "—"],
              ["Email", row.contactEmail ?? "—"],
              ["Phone", row.contactPhone ?? "—"],
              ["Account created", row.accountCreatedAt ? formatDateTime(row.accountCreatedAt) : "—"],
              ["Activity", row.active ? "Active (last 30 days)" : "Inactive"],
              ["Accounts on store", (snapshot.storeUsers.filter((u) => u.store_id === id).length || 0).toString()],
            ]}
          />
        </Panel>
      </div>

      <div className={styles.stack}>
        <Panel title="Shift history" description="Newest first, with the hired worker and payment state." flush>
          {shifts.length === 0 ? (
            <EmptyState title="No shifts yet" text="This store has not posted a shift." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th>Date</th>
                    <th className={styles.num}>Hours</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className={styles.num}>Paid</th>
                    <th>Hired worker</th>
                    <th className={styles.num}>Applicants</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => {
                    const worker = shift.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
                    const status = SHIFT_STATUS[shift.status];
                    const payment = PAYMENT_STATUS[shift.payment_status];
                    const applicants = (snapshot.applicationsByShift.get(shift.id) ?? []).length;
                    return (
                      <tr key={shift.id}>
                        <td>
                          <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                            {shift.task_type}
                          </Link>
                          {shift.shift_location ? <span className={styles.sub}>{shift.shift_location}</span> : null}
                        </td>
                        <td className={styles.nowrap}>
                          {formatDate(shift.start_time)}
                          <span className={styles.sub}>
                            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                          </span>
                        </td>
                        <td className={styles.num}>{hoursText(shift.duration)}</td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>
                          <Badge tone={payment.tone}>{payment.label}</Badge>
                        </td>
                        <td className={styles.num}>{shift.amount_paid_cents ? money(shift.amount_paid_cents) : "—"}</td>
                        <td>
                          {worker ? (
                            <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>
                              {workerContact(snapshot, worker).name ?? "Worker"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={styles.num}>{applicants}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Payment history" description="Stripe Checkout payments recorded for this store." flush>
          {payments.length === 0 ? (
            <EmptyState title="No payments" text="No Stripe payments have been recorded for this store." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paid</th>
                    <th>Shift</th>
                    <th className={styles.num}>Amount</th>
                    <th className={styles.num}>Worker gross</th>
                    <th className={styles.num}>Platform</th>
                    <th>Status</th>
                    <th>Stripe reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const shift = snapshot.shiftById.get(payment.shift_id);
                    return (
                      <tr key={payment.id}>
                        <td className={styles.nowrap}>{payment.paid_at ? formatDateTime(payment.paid_at) : "—"}</td>
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
                        <td className={styles.num}>{money(payment.worker_gross_cents)}</td>
                        <td className={styles.num}>{money(payment.platform_portion_cents)}</td>
                        <td>
                          <Badge tone={payment.status === "paid" ? "approved" : payment.status === "pending" ? "pending" : "cancelled"}>
                            {payment.status}
                          </Badge>
                        </td>
                        <td>
                          <span className={styles.mono}>{payment.stripe_payment_intent_id ?? payment.stripe_checkout_session_id}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Reviews from workers">
          {rating.reviews.length === 0 ? (
            <EmptyState title="No reviews yet" text="Workers can review a store three days after a completed shift." />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {rating.reviews.map((review) => (
                <div key={review.id}>
                  <strong>{review.rating}/5</strong> <span className={styles.muted}>· {formatDate(review.created_at)}</span>
                  {review.comment ? <p style={{ margin: "4px 0 0" }}>{review.comment}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
