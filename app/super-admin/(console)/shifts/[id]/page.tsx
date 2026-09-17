import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import { RecordHoursForm, ReviewHoursForm } from "@/components/super-admin/forms";
import { DefinitionList, Metric, Metrics, Notice, hours as hoursText, money } from "@/components/super-admin/ui";
import { contactLinks } from "@/lib/admin/contact";
import { wallClockNow } from "@/lib/admin/dates";
import { APPLICATION_STATUS, PAYMENT_STATUS, SHIFT_STATUS, STAGE_HELP, STAGE_LABELS, STAGE_TONES } from "@/lib/admin/labels";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, payrollStage, workerContact } from "@/lib/admin/snapshot";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { PLATFORM_HOURLY_PORTION, RETAILER_HOURLY_RATE, WORKER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Shift | Operations Control Center" };

function Step({
  state,
  title,
  children,
}: {
  state: "done" | "pending" | "warn";
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className={styles.step}>
      <span className={`${styles.dot} ${state === "done" ? styles.dotDone : state === "warn" ? styles.dotWarn : ""}`} aria-hidden="true" />
      <div>
        <p className={styles.stepTitle}>{title}</p>
        <p className={styles.stepMeta}>{children ?? (state === "done" ? "Done" : "Not yet")}</p>
      </div>
    </li>
  );
}

const forInput = (wallClock: string) => wallClock.replace(" ", "T").slice(0, 16);

export default async function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const { id } = await params;
  const snapshot = await loadSnapshot();
  const shift = snapshot.shiftById.get(id);
  if (!shift) notFound();

  const store = snapshot.storeById.get(shift.store_id);
  const payment = snapshot.paymentByShift.get(shift.id);
  const entry = snapshot.entryByShift.get(shift.id);
  const applications = (snapshot.applicationsByShift.get(shift.id) ?? []).slice().sort((a, b) => a.applied_at.localeCompare(b.applied_at));
  const accept = snapshot.accepts.find((a) => a.shift_id === shift.id);
  const worker = shift.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
  const workerInfo = worker ? workerContact(snapshot, worker) : null;
  const stage = payrollStage(shift, entry);

  const scheduled = shift.duration;
  const approved = entry?.approved_hours ?? null;
  const payrollHours = approved ?? null;
  const hasFinished = shift.end_time.replace(" ", "T") <= wallClockNow();
  const status = SHIFT_STATUS[shift.status];
  const paymentLabel = PAYMENT_STATUS[shift.payment_status];

  return (
    <>
      <Link href="/super-admin/shifts" className={styles.back}>
        ← Shift operations
      </Link>

      <PageHeader
        eyebrow="Shift"
        title={shift.task_type}
        description={`${store?.name ?? "Unknown store"} · ${formatDate(shift.start_time)} · ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`}
        actions={
          <div className={styles.headerRow}>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={paymentLabel.tone}>{paymentLabel.label}</Badge>
            <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
          </div>
        }
      />

      <Metrics tone="shifts">
        <Metric label="Scheduled hours" value={hoursText(scheduled)} hint={`$${RETAILER_HOURLY_RATE}/hour retailer rate`} />
        <Metric label="Retailer total" value={shift.amount_paid_cents ? money(shift.amount_paid_cents) : money(Math.round(scheduled * RETAILER_HOURLY_RATE * 100))} hint={shift.amount_paid_cents ? "Stripe-confirmed" : "Scheduled estimate — not paid"} />
        <Metric label="Approved hours" value={hoursText(payrollHours)} hint={payrollHours ? "Used for payroll" : "Not approved yet"} />
        <Metric
          label="Worker gross"
          value={money(Math.round((payrollHours ?? scheduled) * WORKER_HOURLY_RATE * 100))}
          hint={payrollHours ? "From approved hours" : "Scheduled estimate"}
        />
        <Metric
          label="Platform portion"
          value={money(Math.round((payrollHours ?? scheduled) * PLATFORM_HOURLY_PORTION * 100))}
          hint={`$${PLATFORM_HOURLY_PORTION}/hour — employment admin, insurance, compliance, payroll ops`}
        />
        <Metric label="Applicants" value={applications.length} />
      </Metrics>

      <div className={styles.detailGrid}>
        <Panel title="Shift details">
          <DefinitionList
            items={[
              ["Task", shift.task_type],
              ["Description", shift.description ?? "—"],
              ["Location", shift.shift_location ?? store?.address ?? "—"],
              ["Scheduled start", formatDateTime(shift.start_time)],
              ["Scheduled end", formatDateTime(shift.end_time)],
              ["Scheduled duration", hoursText(scheduled)],
              ["Retailer hourly rate", `$${shift.hourly_rate ?? RETAILER_HOURLY_RATE}/hour`],
              ["Created", shift.created_at ? formatDateTime(shift.created_at) : "—"],
              ["Shift id", <span className={styles.mono}>{shift.id}</span>],
            ]}
          />
        </Panel>

        <Panel title="Lifecycle" description="Only stages the data actually supports are marked done.">
          <ol className={styles.timeline}>
            <Step state="done" title="Shift created">
              {shift.created_at ? formatDateTime(shift.created_at) : "Date unknown"}
            </Step>

            {shift.payment_status === "legacy" ? (
              <Step state="warn" title="Pre-Stripe shift">
                Created before Stripe payments; no payment record exists for it.
              </Step>
            ) : (
              <Step state={payment ? "done" : "pending"} title="Checkout started">
                {payment ? `${formatDateTime(payment.created_at)} · ${money(payment.amount_cents)} · ${payment.status}` : "No checkout session recorded"}
              </Step>
            )}

            <Step state={shift.payment_status === "paid" ? "done" : shift.payment_status === "legacy" ? "warn" : "pending"} title="Paid & published">
              {shift.paid_at
                ? `Paid ${formatDateTime(shift.paid_at)}${shift.published_at ? ` · published ${formatDateTime(shift.published_at)}` : ""}`
                : shift.payment_status === "legacy"
                  ? "Published before Stripe"
                  : "Not paid — not visible to workers"}
            </Step>

            <Step state={applications.length ? "done" : "pending"} title="Applications received">
              {applications.length
                ? `${applications.length} application${applications.length === 1 ? "" : "s"}, first ${formatDateTime(applications[0].applied_at)}`
                : "No applications yet"}
            </Step>

            <Step state={worker ? "done" : "pending"} title="Worker hired">
              {worker
                ? `${workerInfo?.name ?? "Worker"}${accept?.accepted_at ? ` · ${formatDateTime(accept.accepted_at)}` : ""}`
                : "Nobody hired yet"}
            </Step>

            <Step state={shift.completed_at ? "done" : hasFinished && worker ? "warn" : "pending"} title="Work completed">
              {shift.completed_at
                ? `Confirmed by the store ${formatDateTime(shift.completed_at)}`
                : hasFinished && worker
                  ? "The shift has finished but the store has not confirmed it"
                  : "Not finished"}
            </Step>

            <Step state={entry ? "done" : worker && hasFinished ? "warn" : "pending"} title="Actual hours recorded">
              {entry
                ? `${hoursText(entry.reported_hours)} recorded by ${entry.hours_source === "retailer" ? "the store" : "operations"}${entry.submitted_at ? ` · ${formatDateTime(entry.submitted_at)}` : ""}`
                : "Scheduled hours are not payroll hours — record what was actually worked"}
            </Step>

            <Step
              state={entry?.approval_status === "approved" ? "done" : entry?.approval_status === "rejected" ? "warn" : "pending"}
              title="Hours approved"
            >
              {entry?.approval_status === "approved"
                ? `${hoursText(entry.approved_hours)} approved ${entry.approved_at ? formatDateTime(entry.approved_at) : ""}`
                : entry?.approval_status === "rejected"
                  ? `Rejected${entry.approval_note ? `: ${entry.approval_note}` : ""}`
                  : "Not approved"}
            </Step>

            <Step
              state={entry && ["exported", "submitted", "processed"].includes(entry.payroll_status) ? "done" : entry?.payroll_status === "error" ? "warn" : "pending"}
              title="Payroll"
            >
              {STAGE_HELP[stage]}
              {entry?.payroll_batch_id ? ` · batch ${entry.payroll_batch_id}` : ""}
              {entry?.payroll_external_ref ? ` · ref ${entry.payroll_external_ref}` : ""}
            </Step>
          </ol>
        </Panel>
      </div>

      <div className={styles.stack}>
        {worker ? (
          <Panel
            title="Worked hours & payroll"
            description="Scheduled time is what was booked; payroll uses approved actual hours only."
            action={{ href: "/super-admin/payroll", label: "Payroll queue" }}
          >
            {!hasFinished ? (
              <Notice tone="info">
                <p>This shift has not finished yet, so there are no worked hours to record.</p>
              </Notice>
            ) : (
              <>
                <DefinitionList
                  items={[
                    ["Worker", <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>{workerInfo?.name ?? "Worker"}</Link>],
                    ["Scheduled", `${hoursText(scheduled)} (${formatTime(shift.start_time)}–${formatTime(shift.end_time)})`],
                    ["Actual recorded", entry ? `${entry.actual_start_time ? formatDateTime(entry.actual_start_time) : "—"} → ${entry.actual_end_time ? formatDateTime(entry.actual_end_time) : "—"} (${entry.break_minutes} min break)` : "Not recorded"],
                    ["Reported hours", hoursText(entry?.reported_hours ?? null)],
                    ["Approved hours", hoursText(entry?.approved_hours ?? null)],
                    ["Gross at $20/hour", entry?.approved_hours ? money(Math.round(entry.approved_hours * WORKER_HOURLY_RATE * 100)) : "—"],
                    ["Payroll status", <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>],
                    ["Source note", entry?.submission_note ?? "—"],
                  ]}
                />

                <div className={`${styles.detailGrid} ${styles.chartsSpaced}`}>
                  <div>
                    <h4 className={styles.sectionTitle}>Record actual hours</h4>
                    <RecordHoursForm
                      shiftId={shift.id}
                      defaultStart={forInput(entry?.actual_start_time ?? shift.start_time)}
                      defaultEnd={forInput(entry?.actual_end_time ?? shift.end_time)}
                      scheduledHours={scheduled}
                      existing={Boolean(entry)}
                    />
                  </div>

                  {entry && entry.approval_status !== "approved" ? (
                    <div>
                      <h4 className={styles.sectionTitle}>Approve for payroll</h4>
                      <ReviewHoursForm
                        shiftId={shift.id}
                        reportedHours={entry.reported_hours}
                        canApprove={shift.status === "completed"}
                        blockedReason={
                          shift.status === "completed"
                            ? undefined
                            : "The store has to confirm the shift as completed before hours can be approved. Contact the retailer if this is overdue."
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </Panel>
        ) : null}

        <Panel title="Applicants" flush>
          {applications.length === 0 ? (
            <EmptyState title="No applications" text="Nobody has applied for this shift." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Applied</th>
                    <th>Outcome</th>
                    <th>Reviewed</th>
                    <th>Reach out</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => {
                    const applicant = snapshot.workerById.get(application.worker_id);
                    const info = applicant ? workerContact(snapshot, applicant) : null;
                    const links = contactLinks(info?.phone, info?.email);
                    const outcome = APPLICATION_STATUS[application.status];
                    return (
                      <tr key={application.id}>
                        <td>
                          {applicant ? (
                            <Link className={styles.primaryCell} href={`/super-admin/workers/${applicant.id}`}>
                              {info?.name ?? "Worker"}
                            </Link>
                          ) : (
                            "Unknown worker"
                          )}
                          <span className={styles.sub}>{info?.email ?? "No email"}</span>
                        </td>
                        <td className={styles.nowrap}>
                          {formatDate(application.applied_at)}
                          <span className={styles.sub}>{formatTime(application.applied_at)}</span>
                        </td>
                        <td>
                          <Badge tone={outcome.tone}>{outcome.label}</Badge>
                          {application.rejection_reason ? <span className={styles.sub}>{application.rejection_reason}</span> : null}
                        </td>
                        <td className={styles.nowrap}>{application.reviewed_at ? formatDate(application.reviewed_at) : "—"}</td>
                        <td>
                          {applicant ? (
                            <ContactActions
                              target={{
                                type: "worker",
                                id: applicant.id,
                                name: info?.name ?? "Worker",
                                email: links.email,
                                telHref: links.telHref,
                                whatsappHref: links.whatsappHref,
                              }}
                              subjectHint={`ShiftSupport — ${shift.task_type} on ${formatDate(shift.start_time)}`}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Payment record" description="From `shift_payments` — written only by Stripe-verified fulfilment.">
          {payment ? (
            <DefinitionList
              items={[
                ["Status", payment.status],
                ["Amount", money(payment.amount_cents)],
                ["Hours priced", hoursText(payment.hours)],
                ["Worker gross (scheduled)", money(payment.worker_gross_cents)],
                ["Platform portion (scheduled)", money(payment.platform_portion_cents)],
                ["Paid at", payment.paid_at ? formatDateTime(payment.paid_at) : "—"],
                ["Checkout session", <span className={styles.mono}>{payment.stripe_checkout_session_id}</span>],
                ["Payment intent", payment.stripe_payment_intent_id ? <span className={styles.mono}>{payment.stripe_payment_intent_id}</span> : "—"],
              ]}
            />
          ) : (
            <EmptyState
              title="No payment record"
              text={
                shift.payment_status === "legacy"
                  ? "This shift predates Stripe payments, so no payment was recorded for it."
                  : "No Stripe Checkout session has been recorded for this shift."
              }
            />
          )}
        </Panel>
      </div>
    </>
  );
}
