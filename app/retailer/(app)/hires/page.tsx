import type { Metadata } from "next";

import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import {
  IconCalendar,
  IconCash,
  IconCheck,
  IconUserCheck,
  IconUsers,
} from "@/components/dashboard/Icons";
import { RatingBadge } from "@/components/reviews/Stars";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, StatCard, StatGrid } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";
import { requireRetailer } from "@/lib/auth/session";
import {
  getShiftPayments,
  getStoreApplications,
  getStoreShifts,
  type ApplicationWithContext,
} from "@/lib/data/retailer";
import { getWorkerRating } from "@/lib/data/reviews";
import { formatDate, formatMoney, formatRelative, initialsOf } from "@/lib/format";
import type { ShiftPayment } from "@/lib/supabase/types";
import styles from "./hires.module.css";

export const metadata: Metadata = { title: "Hires & Decisions | ShiftSupport" };

type Filter = "all" | "hired" | "not-selected" | "completed";

const isDecision = (application: ApplicationWithContext) =>
  application.status === "approved" || application.status === "rejected";

const isCompletedHire = (application: ApplicationWithContext) =>
  application.status === "approved" && application.shifts?.status === "completed";

function HistoryCard({
  application,
  rating,
  completedShifts,
  hiredTimes,
  payment,
  storeName,
}: {
  application: ApplicationWithContext;
  rating: { average: number | null; total: number };
  completedShifts: number;
  hiredTimes: number;
  payment?: ShiftPayment;
  storeName: string;
}) {
  const shift = application.shifts;
  const hired = application.status === "approved";
  const name = application.workers?.full_name ?? "Worker";
  const paid = payment?.status === "paid";

  return (
    <article className={`${styles.personCard} ${hired ? styles.hiredCard : styles.declinedCard}`}>
      <div className={styles.cardTop}>
        <span className={`${styles.avatar} ${hired ? styles.avatarHired : ""}`}>
          {initialsOf(name)}
        </span>
        <div className={styles.identity}>
          <h3>{name}</h3>
          <RatingBadge rating={rating} emptyLabel="No reviews yet" />
          <p>
            {hired
              ? `${completedShifts} completed shift${completedShifts === 1 ? "" : "s"} · Hired ${hiredTimes} time${hiredTimes === 1 ? "" : "s"}`
              : `Applied ${formatRelative(application.applied_at)}`}
          </p>
        </div>
        <Badge tone={hired ? "approved" : "rejected"}>
          {hired ? (isCompletedHire(application) ? "Completed" : "Hired") : "Not selected"}
        </Badge>
      </div>

      <div className={styles.shiftBlock}>
        <span className={styles.sectionLabel}>Shift</span>
        <strong>{shift?.task_type ?? "Shift"}</strong>
        <p>
          {storeName} · {formatDate(shift?.start_time)} ·{" "}
          {shift?.shift_location ?? "Location not provided"}
        </p>
      </div>

      <div className={styles.actions}>
        <a
          className={buttonClass("ghost", { small: true })}
          href={`/retailer/applicants?shift=${application.shift_id}&filter=all`}
        >
          View shift
        </a>
        {paid ? (
          <a
            className={buttonClass("ghost", { small: true })}
            href={`/retailer/shifts/${application.shift_id}/payment`}
          >
            View receipt
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default async function HiresPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { store } = await requireRetailer();
  const params = await searchParams;
  const filter: Filter = (["all", "hired", "not-selected", "completed"] as const).includes(
    params.filter as Filter,
  )
    ? (params.filter as Filter)
    : "all";

  const [{ applications, error: applicationError }, { shifts, error: shiftError }] =
    await Promise.all([getStoreApplications(store.id), getStoreShifts(store.id)]);

  const decisions = applications.filter(isDecision);
  const hired = decisions.filter((application) => application.status === "approved");
  const declined = decisions.filter((application) => application.status === "rejected");
  const completed = hired.filter(isCompletedHire);
  const payments = await getShiftPayments(shifts.map((shift) => shift.id));
  const paidPayments = [...payments.values()].filter((payment) => payment.status === "paid");

  const workerIds = [...new Set(decisions.map((application) => application.worker_id))];
  const ratings = new Map(
    await Promise.all(workerIds.map(async (id) => [id, await getWorkerRating(id)] as const)),
  );

  const hireCounts = new Map<string, number>();
  const completedCounts = new Map<string, number>();
  for (const application of hired) {
    hireCounts.set(application.worker_id, (hireCounts.get(application.worker_id) ?? 0) + 1);
    if (isCompletedHire(application)) {
      completedCounts.set(
        application.worker_id,
        (completedCounts.get(application.worker_id) ?? 0) + 1,
      );
    }
  }

  const visible =
    filter === "hired"
      ? hired
      : filter === "not-selected"
        ? declined
        : filter === "completed"
          ? completed
          : decisions;

  const tabs: TabItem[] = [
    { key: "all", label: "All", href: "/retailer/hires", count: decisions.length },
    { key: "hired", label: "Hired", href: "/retailer/hires?filter=hired", count: hired.length },
    {
      key: "not-selected",
      label: "Not Selected",
      href: "/retailer/hires?filter=not-selected",
      count: declined.length,
    },
    {
      key: "completed",
      label: "Completed",
      href: "/retailer/hires?filter=completed",
      count: completed.length,
    },
  ];

  const totalPaidCents = paidPayments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const workerGrossCents = paidPayments.reduce(
    (sum, payment) => sum + (payment.worker_gross_cents ?? 0),
    0,
  );
  const platformCents = paidPayments.reduce(
    (sum, payment) => sum + (payment.platform_portion_cents ?? 0),
    0,
  );
  const error = applicationError ?? shiftError;

  return (
    <>
      <PageHeader
        eyebrow="Your people"
        title="Hires & Decisions"
        description="A clear history of the workers you've hired, the applicants you passed on, and the shifts you've paid for."
      />

      <StatGrid>
        <StatCard label="Hired Workers" value={hired.length} hint={`${hireCounts.size} unique workers`} icon={<IconUserCheck />} />
        <StatCard label="Not Selected" value={declined.length} hint="Applications declined" icon={<IconUsers />} tone="peach" />
        <StatCard label="Completed Hires" value={completed.length} hint="Confirmed completed shifts" icon={<IconCheck />} tone="lime" />
        <StatCard label="Paid Shifts" value={paidPayments.length} hint="Verified payment records" icon={<IconCalendar />} />
        <StatCard label="Total Shift Spend" value={formatMoney(totalPaidCents / 100)} hint="Paid to ShiftSupport" icon={<IconCash />} />
      </StatGrid>

      <Panel title="Payment summary" description="Verified paid shift records for this store only.">
        <dl className={styles.paymentSummary}>
          <div><dt>Total paid to ShiftSupport</dt><dd>{formatMoney(totalPaidCents / 100)}</dd></div>
          <div><dt>Worker gross represented</dt><dd>{formatMoney(workerGrossCents / 100)}</dd></div>
          <div><dt>ShiftSupport platform portion</dt><dd>{formatMoney(platformCents / 100)}</dd></div>
          <div><dt>Number of paid shifts</dt><dd>{paidPayments.length}</dd></div>
        </dl>
        <p className={styles.accountingNote}>For payment history only. No worker payouts are created from this page.</p>
      </Panel>

      <div className={styles.tabs}><Tabs items={tabs} active={filter} label="Filter hiring history" /></div>

      {error ? (
        <Panel><ErrorState text={`We couldn't load the complete hiring history. ${error}`} /></Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            icon={filter === "not-selected" ? <IconUsers /> : <IconUserCheck />}
            title={filter === "not-selected" ? "No declined applications yet." : "No workers hired yet."}
            text={filter === "not-selected" ? "Workers you pass on will appear here." : "Your hiring decisions will appear here once you select a worker."}
            action={<a className={buttonClass("primary")} href="/retailer/applicants">View applicants</a>}
          />
        </Panel>
      ) : (
        <div className={styles.peopleGrid}>
          {visible.map((application) => (
            <HistoryCard
              key={application.id}
              application={application}
              rating={ratings.get(application.worker_id) ?? { average: null, total: 0 }}
              completedShifts={completedCounts.get(application.worker_id) ?? 0}
              hiredTimes={hireCounts.get(application.worker_id) ?? 0}
              payment={payments.get(application.shift_id)}
              storeName={store.name}
            />
          ))}
        </div>
      )}
    </>
  );
}
