import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import { WorkerPayrollIdForm } from "@/components/super-admin/forms";
import {
  DefinitionList,
  Metric,
  Metrics,
  hours as hoursText,
  money,
} from "@/components/super-admin/ui";
import { MEMBERSHIP_LABELS, MEMBERSHIP_TONES, workerRows } from "@/lib/admin/people";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, payrollStage, workerRating } from "@/lib/admin/snapshot";
import { SHIFT_STATUS, STAGE_LABELS, STAGE_TONES } from "@/lib/admin/labels";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Worker | Operations Control Center" };

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const { id } = await params;
  const snapshot = await loadSnapshot();
  const worker = snapshot.workerById.get(id);
  if (!worker) notFound();

  const row = workerRows(snapshot).find((r) => r.id === id);
  if (!row) notFound();

  const applications = (snapshot.applicationsByWorker.get(id) ?? []).slice().sort((a, b) => b.applied_at.localeCompare(a.applied_at));
  const shifts = (snapshot.shiftsByWorker.get(id) ?? []).slice().sort((a, b) => b.start_time.localeCompare(a.start_time));
  const rating = workerRating(snapshot, worker);
  const entries = snapshot.timeEntries.filter((e) => e.worker_id === id);
  const approvedHours = entries
    .filter((e) => e.approval_status === "approved")
    .reduce((sum, e) => sum + (e.approved_hours ?? 0), 0);

  return (
    <>
      <Link href="/super-admin/workers" className={styles.back}>
        ← Worker directory
      </Link>

      <PageHeader
        eyebrow="Worker"
        title={row.name ?? "Unnamed worker"}
        description={`Joined ${formatDate(row.createdAt)} at ${formatTime(row.createdAt)}.`}
        actions={
          <ContactActions
            target={{
              type: "worker",
              id,
              name: row.name ?? "Worker",
              email: row.contact.email,
              telHref: row.contact.telHref,
              whatsappHref: row.contact.whatsappHref,
            }}
            subjectHint="ShiftSupport — about your account"
          />
        }
      />

      <Metrics tone="workers">
        <Metric label="Applications" value={row.applications} hint={`${row.pendingApplications} pending`} />
        <Metric label="Hired shifts" value={row.hired} />
        <Metric label="Completed" value={row.completed} />
        <Metric label="Approved payroll hours" value={hoursText(approvedHours || null)} hint="Across all shifts" />
        <Metric
          label="Rating"
          value={row.ratingAverage === null ? "—" : row.ratingAverage.toFixed(1)}
          hint={`${row.ratingCount} retailer review${row.ratingCount === 1 ? "" : "s"}`}
        />
      </Metrics>

      <div className={styles.detailGrid}>
        <Panel title="Profile & contact">
          <DefinitionList
            items={[
              ["Full name", row.name ?? "—"],
              ["Email", row.email ?? "—"],
              ["Phone", row.phone ?? "—"],
              ["Account created", row.createdAt ? formatDateTime(row.createdAt) : "—"],
              ["Activity", row.active ? "Active (last 30 days)" : "Inactive"],
              ["Worker id", <span className={styles.mono}>{id}</span>],
            ]}
          />
        </Panel>

        <Panel title="Membership" description="Written only by Stripe-verified state.">
          <DefinitionList
            items={[
              ["Status", <Badge tone={MEMBERSHIP_TONES[row.membership]}>{MEMBERSHIP_LABELS[row.membership]}</Badge>],
              ["Marketplace access", ["paid_active", "complimentary", "past_due"].includes(row.membership) ? "Yes" : "No"],
              ["Started", row.membershipStartedAt ? formatDate(row.membershipStartedAt) : "—"],
              ["Renews / expires", row.membershipExpiresAt ? formatDate(row.membershipExpiresAt) : row.membership === "complimentary" ? "No expiry" : "—"],
              ["Cancels at period end", row.cancelAtPeriodEnd ? "Yes" : "No"],
              ["Stripe subscription", row.hasStripeSubscription ? <span className={styles.mono}>{worker.stripe_subscription_id}</span> : "None"],
              ["Stripe customer", worker.stripe_customer_id ? <span className={styles.mono}>{worker.stripe_customer_id}</span> : "None"],
            ]}
          />
        </Panel>
      </div>

      <div className={styles.stack}>
        <Panel title="Hired shifts" description="Shifts this worker was hired for, newest first." flush>
          {shifts.length === 0 ? (
            <EmptyState title="No hires yet" text="This worker has not been hired for a shift." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th>Store</th>
                    <th>Date</th>
                    <th className={styles.num}>Scheduled</th>
                    <th className={styles.num}>Approved</th>
                    <th>Status</th>
                    <th>Payroll</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => {
                    const entry = snapshot.entryByShift.get(shift.id);
                    const stage = payrollStage(shift, entry);
                    const status = SHIFT_STATUS[shift.status];
                    return (
                      <tr key={shift.id}>
                        <td>
                          <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                            {shift.task_type}
                          </Link>
                        </td>
                        <td>{snapshot.storeById.get(shift.store_id)?.name ?? "—"}</td>
                        <td className={styles.nowrap}>
                          {formatDate(shift.start_time)}
                          <span className={styles.sub}>
                            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                          </span>
                        </td>
                        <td className={styles.num}>{hoursText(shift.duration)}</td>
                        <td className={styles.num}>{hoursText(entry?.approved_hours ?? null)}</td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>
                          <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Application history" flush>
          {applications.length === 0 ? (
            <EmptyState title="No applications" text="This worker has not applied for a shift yet." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Applied</th>
                    <th>Shift</th>
                    <th>Store</th>
                    <th>Outcome</th>
                    <th>Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => {
                    const shift = snapshot.shiftById.get(application.shift_id);
                    return (
                      <tr key={application.id}>
                        <td className={styles.nowrap}>
                          {formatDate(application.applied_at)}
                          <span className={styles.sub}>{formatTime(application.applied_at)}</span>
                        </td>
                        <td>
                          {shift ? (
                            <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                              {shift.task_type}
                            </Link>
                          ) : (
                            "Deleted shift"
                          )}
                          {shift ? <span className={styles.sub}>{formatDate(shift.start_time)}</span> : null}
                        </td>
                        <td>{shift ? snapshot.storeById.get(shift.store_id)?.name ?? "—" : "—"}</td>
                        <td>
                          <Badge tone={application.status === "approved" ? "approved" : application.status === "rejected" ? "rejected" : "pending"}>
                            {application.status === "approved" ? "Hired" : application.status === "rejected" ? "Not selected" : "Pending"}
                          </Badge>
                          {application.rejection_reason ? <span className={styles.sub}>{application.rejection_reason}</span> : null}
                        </td>
                        <td className={styles.nowrap}>{application.reviewed_at ? formatDate(application.reviewed_at) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className={styles.detailGrid}>
          <Panel title="Reviews received" description="From retailers, after completed shifts.">
            {rating.reviews.length === 0 ? (
              <EmptyState title="No reviews yet" text="Reviews appear three days after a shift is completed." />
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {rating.reviews.map((review) => (
                  <div key={review.id}>
                    <strong>{review.rating}/5</strong>{" "}
                    <span className={styles.muted}>· {formatDate(review.created_at)}</span>
                    {review.comment ? <p style={{ margin: "4px 0 0" }}>{review.comment}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Payroll mapping" description="ADP handles worker payroll. No bank or tax details are stored in this app.">
            <WorkerPayrollIdForm workerId={id} value={row.payrollEmployeeId} />
            <p className={`${styles.metricHint} ${styles.noteAfter}`}>
              Approved hours to date: <strong>{hoursText(approvedHours || null)}</strong> · gross at $20/hour:{" "}
              <strong>{money(Math.round(approvedHours * 20 * 100))}</strong>
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
