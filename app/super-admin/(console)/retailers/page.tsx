import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import {
  FilterBar,
  Metric,
  Metrics,
  Pagination,
  SearchFilter,
  SelectFilter,
  SortHeader,
  matchesSearch,
  money,
  paginate,
  searchText,
  sortRows,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { ACTIVITY_WINDOW_DAYS } from "@/lib/admin/metrics";
import { retailerRows } from "@/lib/admin/people";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { formatDate, formatTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Retailers | Operations Control Center" };

const PATH = "/super-admin/retailers";

export default async function RetailersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; activity?: string; sort?: string; dir?: string; page?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const snapshot = await loadSnapshot();
  const all = retailerRows(snapshot);

  const q = searchText(params.q);
  const filtered = all.filter((row) => {
    if (!matchesSearch(q, row.storeName, row.contactName, row.contactEmail, row.storeAddress, row.contactPhone, row.storePhone)) return false;
    if (params.activity === "active" && !row.active) return false;
    if (params.activity === "inactive" && row.active) return false;
    return true;
  });

  const sorted = sortRows(filtered, params.dir, (row) => {
    switch (params.sort) {
      case "store":
        return row.storeName.toLowerCase();
      case "shifts":
        return row.shiftsPosted;
      case "paid":
        return row.paid.amountCents;
      case "completed":
        return row.completedShifts;
      case "rating":
        return row.ratingAverage;
      default:
        return row.accountCreatedAt ?? row.storeCreatedAt ?? "";
    }
  });

  const { page, pageCount, rows } = paginate(sorted, params.page, PAGE_SIZE);
  const totals = filtered.reduce((sum, row) => sum + row.paid.amountCents, 0);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Retailer directory"
        description="Stores, their contacts and what they have spent. Store phone numbers are private to operations and the hired worker."
      />

      <Metrics tone="retailers">
        <Metric label="Stores matching" value={filtered.length} hint={`of ${all.length} total`} />
        <Metric label="Active" value={filtered.filter((r) => r.active).length} hint={`Posted in last ${ACTIVITY_WINDOW_DAYS} days`} />
        <Metric label="Shifts posted" value={filtered.reduce((sum, r) => sum + r.shiftsPosted, 0)} />
        <Metric label="Paid volume" value={money(totals)} hint="Stripe-confirmed" />
      </Metrics>

      <FilterBar path={PATH} keep={{ sort: params.sort, dir: params.dir }}>
        <SearchFilter value={params.q} placeholder="Store, contact, email or address" />
        <SelectFilter
          name="activity"
          label="Activity"
          value={params.activity}
          options={[
            { value: "", label: "Any" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </FilterBar>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState title="No retailers match" text="Try a different search or clear the filters." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortHeader path={PATH} params={params} column="store" label="Store" />
                    <th>Contact</th>
                    <th>Location</th>
                    <SortHeader path={PATH} params={params} column="created" label="Joined" />
                    <SortHeader path={PATH} params={params} column="shifts" label="Shifts" numeric />
                    <th className={styles.num}>Paid / open</th>
                    <SortHeader path={PATH} params={params} column="completed" label="Done" numeric />
                    <SortHeader path={PATH} params={params} column="paid" label="Spend" numeric />
                    <th>Reach out</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.storeId}>
                      <td>
                        <Link className={styles.primaryCell} href={`${PATH}/${row.storeId}`}>
                          {row.storeName}
                        </Link>
                        <span className={styles.sub}>{row.active ? "Active" : "Inactive"}</span>
                      </td>
                      <td>
                        {row.contactName ?? "—"}
                        <span className={styles.sub}>{row.contactEmail ?? "No email"}</span>
                        <span className={styles.sub}>{row.contactPhone ?? row.storePhone ?? "No phone"}</span>
                      </td>
                      <td>{row.storeAddress ?? "—"}</td>
                      <td className={styles.nowrap}>
                        {formatDate(row.accountCreatedAt ?? row.storeCreatedAt)}
                        <span className={styles.sub}>{formatTime(row.accountCreatedAt ?? row.storeCreatedAt)}</span>
                      </td>
                      <td className={styles.num}>
                        {row.shiftsPosted}
                        {row.draftShifts ? <span className={styles.sub}>{row.draftShifts} unpaid</span> : null}
                      </td>
                      <td className={styles.num}>
                        {row.paidShifts} / {row.openShifts}
                      </td>
                      <td className={styles.num}>{row.completedShifts}</td>
                      <td className={styles.num}>
                        {money(row.paid.amountCents)}
                        <span className={styles.sub}>{row.paid.count} payments</span>
                      </td>
                      <td>
                        <ContactActions
                          target={{
                            type: "retailer",
                            id: row.storeId,
                            name: row.storeName,
                            email: row.contact.email,
                            telHref: row.contact.telHref ?? row.storeContact.telHref,
                            whatsappHref: row.contact.whatsappHref ?? row.storeContact.whatsappHref,
                          }}
                          subjectHint="ShiftSupport — about your store"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={sorted.length} />
          </>
        )}
      </Panel>

      <p className={`${styles.metricHint} ${styles.noteAfter}`}>
        <Badge tone="neutral">Note</Badge> Spend counts Stripe-confirmed shift payments only. Shifts from before Stripe
        (&quot;pre-Stripe&quot;) carry no payment record and are excluded.
      </p>
    </>
  );
}
