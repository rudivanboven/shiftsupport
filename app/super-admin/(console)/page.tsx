import type { Metadata } from "next";

import { PageHeader, Panel } from "@/components/ui/Kit";
import {
  IconCalendar,
  IconCash,
  IconStore,
  IconUserCheck,
  IconUsers,
} from "@/components/dashboard/Icons";
import {
  BarTrend,
  Metric,
  Metrics,
  Notice,
  RangeFilter,
  Section,
  money,
} from "@/components/super-admin/ui";
import { parseRange } from "@/lib/admin/dates";
import { ACTIVITY_WINDOW_DAYS, rangeMetrics, summarise } from "@/lib/admin/metrics";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { REPORTING_TIME_ZONE } from "@/lib/admin/config";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Dashboard | Operations Control Center" };

export default async function OperationsDashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const range = parseRange(params);
  const snapshot = await loadSnapshot();
  const s = summarise(snapshot);
  const r = rangeMetrics(snapshot, range);

  const missingOps = snapshot.warnings.includes("shift_time_entries");

  return (
    <>
      <PageHeader
        eyebrow="Operations Control Center"
        title="Operations dashboard"
        description={`Live figures from the production database. Days are counted in ${REPORTING_TIME_ZONE.replace("_", " ")}.`}
      />

      {snapshot.warnings.length ? (
        <Notice>
          <p>
            Some tables could not be read: <strong>{snapshot.warnings.join(", ")}</strong>.
            {missingOps ? " Run migration 0010 in the Supabase SQL editor to enable worked hours and payroll." : ""}
          </p>
        </Notice>
      ) : null}

      <Section
        title="Workers"
        subtitle="Signups, marketplace activity and membership state."
        tone="workers"
        icon={<IconUsers width={17} height={17} />}
        link={{ href: "/super-admin/workers", label: "Worker directory" }}
      >
        <Metrics>
          <Metric label="Total workers" value={s.workers.total} href="/super-admin/workers" />
          <Metric label="New today" value={s.workers.today} />
          <Metric label="New · 7 days" value={s.workers.last7} />
          <Metric label="New · 30 days" value={s.workers.last30} />
          <Metric label="Active" value={s.workers.active} hint={`Applied or worked in the last ${ACTIVITY_WINDOW_DAYS} days`} />
          <Metric label="Inactive" value={s.workers.inactive} hint={`No activity in ${ACTIVITY_WINDOW_DAYS} days`} />
          <Metric
            label="Paid memberships"
            value={s.workers.paidMemberships}
            hint="Active Stripe subscription"
            href="/super-admin/workers?membership=paid_active"
          />
          <Metric
            label="Complimentary"
            value={s.workers.complimentary}
            hint="Access without a subscription (pre-Stripe workers)"
            href="/super-admin/workers?membership=complimentary"
          />
          <Metric
            label="No active membership"
            value={s.workers.inactiveMemberships}
            hint="Cannot apply for shifts"
            href="/super-admin/workers?membership=inactive"
          />
        </Metrics>
      </Section>

      <Section
        title="Retailers"
        subtitle="Retailer accounts and the stores they post shifts for."
        tone="retailers"
        icon={<IconStore width={17} height={17} />}
        link={{ href: "/super-admin/retailers", label: "Retailer directory" }}
      >
        <Metrics>
          <Metric label="Retailer accounts" value={s.retailers.total} href="/super-admin/retailers" />
          <Metric label="Stores" value={s.retailers.stores} />
          <Metric label="New today" value={s.retailers.today} />
          <Metric label="New · 7 days" value={s.retailers.last7} />
          <Metric label="New · 30 days" value={s.retailers.last30} />
          <Metric label="Active stores" value={s.retailers.active} hint={`Posted a shift in the last ${ACTIVITY_WINDOW_DAYS} days`} />
        </Metrics>
      </Section>

      <Section
        title="Shifts"
        subtitle="What has been posted, what is open, and what has been worked."
        tone="shifts"
        icon={<IconCalendar width={17} height={17} />}
        link={{ href: "/super-admin/shifts", label: "Shift operations" }}
      >
        <Metrics>
          <Metric label="Posted today" value={s.shifts.today} />
          <Metric label="Posted this week" value={s.shifts.week} hint="Last 7 days" />
          <Metric label="Posted this month" value={s.shifts.month} hint="Last 30 days" />
          <Metric label="Open" value={s.shifts.open} hint="Paid and awaiting applicants" href="/super-admin/shifts?status=open" />
          <Metric label="Hired" value={s.shifts.hired} href="/super-admin/shifts?status=hired" />
          <Metric label="Completed" value={s.shifts.completed} href="/super-admin/shifts?status=completed" />
          <Metric label="Awaiting payment" value={s.shifts.draft} hint="Draft — not visible to workers" href="/super-admin/shifts?status=draft" />
        </Metrics>
      </Section>

      <Section
        title="Applications"
        subtitle="Applications coming in, and how they were decided."
        tone="applications"
        icon={<IconUserCheck width={17} height={17} />}
        link={{ href: "/super-admin/applications", label: "Applications & hires" }}
      >
        <Metrics>
          <Metric label="Today" value={s.applications.today} />
          <Metric label="This week" value={s.applications.week} hint="Last 7 days" />
          <Metric label="Pending" value={s.applications.pending} href="/super-admin/applications?status=pending" />
          <Metric label="Hired" value={s.applications.approved} href="/super-admin/applications?status=approved" />
          <Metric label="Not selected" value={s.applications.rejected} href="/super-admin/applications?status=rejected" />
          <Metric label="All applications" value={s.applications.total} />
        </Metrics>
      </Section>

      <Section
        title="Financial"
        subtitle="Stripe-confirmed retailer payments only — unpaid and draft shifts are never counted."
        tone="finance"
        icon={<IconCash width={17} height={17} />}
        link={{ href: "/super-admin/finance", label: "Finance centre" }}
      >
        <Metrics>
          <Metric label="Retailer payments today" value={money(s.finance.today.amountCents)} hint={`${s.finance.today.count} paid shift${s.finance.today.count === 1 ? "" : "s"}`} />
          <Metric label="Payments · 7 days" value={money(s.finance.last7.amountCents)} hint={`${s.finance.last7.count} paid`} />
          <Metric label="Payments · 30 days" value={money(s.finance.last30.amountCents)} hint={`${s.finance.last30.count} paid`} />
          <Metric label="Total paid volume" value={money(s.finance.allTime.amountCents)} hint="All Stripe-confirmed payments" />
          <Metric label="Worker gross represented" value={money(s.finance.allTime.workerGrossCents)} hint="$20/hour of scheduled hours" />
          <Metric label="Platform portion" value={money(s.finance.allTime.platformCents)} hint="$8/hour — employment admin, insurance, compliance, payroll ops" />
          <Metric label="Paid shifts" value={s.finance.allTime.count} />
          <Metric label="Awaiting payment" value={money(s.finance.pendingCents)} hint={`${s.finance.pendingCount} checkout${s.finance.pendingCount === 1 ? "" : "s"} not completed — not revenue`} />
        </Metrics>
      </Section>

      <Panel
        title={`Trends — ${range.label}`}
        description="Counted from the database. Retailer payment volume is Stripe-confirmed money only."
      >
        <RangeFilter path="/super-admin" params={params} range={range} />

        <Metrics>
          <Metric label="Worker signups" value={r.workerSignups} />
          <Metric label="Retailer signups" value={r.retailerSignups} />
          <Metric label="Shifts posted" value={r.shiftsPosted} />
          <Metric label="Applications" value={r.applications} />
          <Metric label="Hires" value={r.hires} />
          <Metric label="Completed shifts" value={r.completed} />
          <Metric label="Retailer payments" value={money(r.payments.amountCents)} hint={`${r.payments.count} paid shifts`} />
        </Metrics>

        <div className={`${styles.charts} ${styles.chartsSpaced}`}>
          <BarTrend title="Worker registrations" buckets={r.charts.workers} />
          <BarTrend title="Retailer registrations" buckets={r.charts.retailers} />
          <BarTrend title="Shifts posted" buckets={r.charts.shifts} />
          <BarTrend title="Applications" buckets={r.charts.applications} />
          <BarTrend title="Hires" buckets={r.charts.hires} />
          <BarTrend title="Retailer payment volume" buckets={r.charts.revenue} format={(v) => money(Math.round(v * 100))} />
        </div>
      </Panel>
    </>
  );
}
