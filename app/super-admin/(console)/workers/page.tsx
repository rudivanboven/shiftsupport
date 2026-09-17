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
  paginate,
  searchText,
  sortRows,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { MEMBERSHIP_LABELS, MEMBERSHIP_TONES, workerRows } from "@/lib/admin/people";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { ACTIVITY_WINDOW_DAYS } from "@/lib/admin/metrics";
import { formatDate, formatTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Workers | Operations Control Center" };

const PATH = "/super-admin/workers";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; membership?: string; activity?: string; sort?: string; dir?: string; page?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const snapshot = await loadSnapshot();
  const all = workerRows(snapshot);

  const q = searchText(params.q);
  const filtered = all.filter((row) => {
    if (!matchesSearch(q, row.name, row.email, row.phone)) return false;
    if (params.membership && params.membership !== "any" && row.membership !== params.membership) return false;
    if (params.activity === "active" && !row.active) return false;
    if (params.activity === "inactive" && row.active) return false;
    return true;
  });

  const sorted = sortRows(filtered, params.dir, (row) => {
    switch (params.sort) {
      case "name":
        return row.name?.toLowerCase() ?? "";
      case "applications":
        return row.applications;
      case "hired":
        return row.hired;
      case "completed":
        return row.completed;
      case "rating":
        return row.ratingAverage;
      case "membership":
        return MEMBERSHIP_LABELS[row.membership];
      default:
        return row.createdAt ?? "";
    }
  });

  const { page, pageCount, rows } = paginate(sorted, params.page, PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Worker directory"
        description="Every worker account with membership state, marketplace activity and ratings. Contact details are shown to Super Admins only."
      />

      <Metrics tone="workers">
        <Metric label="Workers matching" value={filtered.length} hint={`of ${all.length} total`} />
        <Metric label="Active" value={filtered.filter((r) => r.active).length} hint={`Last ${ACTIVITY_WINDOW_DAYS} days`} />
        <Metric label="Paid memberships" value={filtered.filter((r) => r.membership === "paid_active").length} />
        <Metric label="No active membership" value={filtered.filter((r) => ["inactive", "expired", "canceled"].includes(r.membership)).length} />
      </Metrics>

      <FilterBar path={PATH} keep={{ sort: params.sort, dir: params.dir }}>
        <SearchFilter value={params.q} placeholder="Name, email or phone" />
        <SelectFilter
          name="membership"
          label="Membership"
          value={params.membership}
          options={[
            { value: "", label: "Any" },
            ...(Object.keys(MEMBERSHIP_LABELS) as (keyof typeof MEMBERSHIP_LABELS)[]).map((key) => ({
              value: key,
              label: MEMBERSHIP_LABELS[key],
            })),
          ]}
        />
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
          <EmptyState title="No workers match" text="Try a different search or clear the filters." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortHeader path={PATH} params={params} column="name" label="Worker" />
                    <th>Contact</th>
                    <SortHeader path={PATH} params={params} column="created" label="Joined" />
                    <SortHeader path={PATH} params={params} column="membership" label="Membership" />
                    <SortHeader path={PATH} params={params} column="applications" label="Apps" numeric />
                    <SortHeader path={PATH} params={params} column="hired" label="Hired" numeric />
                    <SortHeader path={PATH} params={params} column="completed" label="Done" numeric />
                    <SortHeader path={PATH} params={params} column="rating" label="Rating" numeric />
                    <th>Reach out</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link className={styles.primaryCell} href={`${PATH}/${row.id}`}>
                          {row.name ?? "Unnamed worker"}
                        </Link>
                        <span className={styles.sub}>{row.active ? "Active" : "Inactive"}</span>
                      </td>
                      <td>
                        <span className={styles.sub} style={{ marginTop: 0 }}>{row.email ?? "No email"}</span>
                        <span className={styles.sub}>{row.phone ?? "No phone"}</span>
                      </td>
                      <td className={styles.nowrap}>
                        {formatDate(row.createdAt)}
                        <span className={styles.sub}>{formatTime(row.createdAt)}</span>
                      </td>
                      <td>
                        <Badge tone={MEMBERSHIP_TONES[row.membership]}>{MEMBERSHIP_LABELS[row.membership]}</Badge>
                        {row.membershipExpiresAt ? (
                          <span className={styles.sub}>Renews/ends {formatDate(row.membershipExpiresAt)}</span>
                        ) : row.membership === "complimentary" ? (
                          <span className={styles.sub}>No expiry</span>
                        ) : null}
                      </td>
                      <td className={styles.num}>
                        {row.applications}
                        {row.pendingApplications ? <span className={styles.sub}>{row.pendingApplications} pending</span> : null}
                      </td>
                      <td className={styles.num}>{row.hired}</td>
                      <td className={styles.num}>{row.completed}</td>
                      <td className={styles.num}>
                        {row.ratingAverage === null ? "—" : row.ratingAverage.toFixed(1)}
                        {row.ratingCount ? <span className={styles.sub}>{row.ratingCount} review{row.ratingCount === 1 ? "" : "s"}</span> : null}
                      </td>
                      <td>
                        <ContactActions
                          target={{
                            type: "worker",
                            id: row.id,
                            name: row.name ?? "Worker",
                            email: row.contact.email,
                            telHref: row.contact.telHref,
                            whatsappHref: row.contact.whatsappHref,
                          }}
                          subjectHint="ShiftSupport — about your account"
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
    </>
  );
}
