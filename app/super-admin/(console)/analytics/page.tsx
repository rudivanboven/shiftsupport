import type { Metadata } from "next";

import { PageHeader, Panel } from "@/components/ui/Kit";
import { BarTrend, Metric, Metrics, RangeFilter, money } from "@/components/super-admin/ui";
import { parseRange } from "@/lib/admin/dates";
import { rangeMetrics } from "@/lib/admin/metrics";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot } from "@/lib/admin/snapshot";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Analytics | Operations Control Center" };

export default async function AnalyticsPage({
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
  const r = rangeMetrics(snapshot, range);

  const conversion = r.applications ? Math.round((r.hires / r.applications) * 100) : null;

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title={`Activity — ${range.label}`}
        description="Registrations, marketplace activity and Stripe-confirmed payment volume over the period you choose. Ranges longer than 62 days are grouped by week."
      />

      <RangeFilter path="/super-admin/analytics" params={params} range={range} />

      <Metrics tone="neutral">
        <Metric label="Worker registrations" value={r.workerSignups} />
        <Metric label="Retailer registrations" value={r.retailerSignups} />
        <Metric label="Shifts posted" value={r.shiftsPosted} />
        <Metric label="Applications" value={r.applications} />
        <Metric label="Hires" value={r.hires} />
        <Metric label="Completed shifts" value={r.completed} />
        <Metric label="Application → hire" value={conversion === null ? "—" : `${conversion}%`} hint="Hires ÷ applications in this period" />
        <Metric label="Retailer payment volume" value={money(r.payments.amountCents)} hint={`${r.payments.count} paid shifts`} />
      </Metrics>

      <Panel title="Trends" description="Each bar is one day (or one week for long ranges). Hover a bar for its value.">
        <div className={styles.charts}>
          <BarTrend title="Worker registrations" buckets={r.charts.workers} />
          <BarTrend title="Retailer registrations" buckets={r.charts.retailers} />
          <BarTrend title="Shift postings" buckets={r.charts.shifts} />
          <BarTrend title="Applications" buckets={r.charts.applications} />
          <BarTrend title="Hires" buckets={r.charts.hires} />
          <BarTrend title="Completed shifts" buckets={r.charts.completed} />
          <BarTrend title="Retailer payment volume" buckets={r.charts.revenue} format={(v) => money(Math.round(v * 100))} />
        </div>
      </Panel>
    </>
  );
}
