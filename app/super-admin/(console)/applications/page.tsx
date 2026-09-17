import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import {
  FilterBar,
  Metric,
  Metrics,
  Pagination,
  RangeFilter,
  SearchFilter,
  SelectFilter,
  SortHeader,
  matchesSearch,
  paginate,
  searchText,
  sortRows,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { instantInRange, parseRange } from "@/lib/admin/dates";
import { APPLICATION_STATUS, SHIFT_STATUS } from "@/lib/admin/labels";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, workerContact } from "@/lib/admin/snapshot";
import { formatDate, formatTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Applications | Operations Control Center" };

const PATH = "/super-admin/applications";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    store?: string;
    range?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const range = parseRange(params, "all");
  const snapshot = await loadSnapshot();

  const q = searchText(params.q);

  const rowsAll = snapshot.applications.map((application) => {
    const shift = snapshot.shiftById.get(application.shift_id);
    const store = shift ? snapshot.storeById.get(shift.store_id) : undefined;
    const worker = snapshot.workerById.get(application.worker_id);
    const info = worker ? workerContact(snapshot, worker) : null;
    return { application, shift, store, worker, workerName: info?.name ?? null, workerEmail: info?.email ?? null };
  });

  const filtered = rowsAll.filter((row) => {
    if (!matchesSearch(q, row.workerName, row.workerEmail, row.shift?.task_type, row.store?.name, row.shift?.shift_location)) return false;
    if (params.status && params.status !== "any" && row.application.status !== params.status) return false;
    if (params.store && row.shift?.store_id !== params.store) return false;
    if (range.from && !instantInRange(row.application.applied_at, range)) return false;
    return true;
  });

  const sorted = sortRows(filtered, params.dir, (row) => {
    switch (params.sort) {
      case "worker":
        return row.workerName?.toLowerCase() ?? "";
      case "store":
        return row.store?.name?.toLowerCase() ?? "";
      case "shiftDate":
        return row.shift?.start_time ?? "";
      case "status":
        return row.application.status;
      default:
        return row.application.applied_at;
    }
  });

  const { page, pageCount, rows } = paginate(sorted, params.page, PAGE_SIZE);

  const storeOptions = [
    { value: "", label: "All stores" },
    ...snapshot.stores.slice().sort((a, b) => a.name.localeCompare(b.name)).map((store) => ({ value: store.id, label: store.name })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Applications & hires"
        description="Who applied for what, and how it ended. Counts follow the filters below."
      />

      <Metrics tone="applications">
        <Metric label="Applications" value={filtered.length} hint={range.from ? range.label : "All time"} />
        <Metric label="Pending" value={filtered.filter((r) => r.application.status === "pending").length} />
        <Metric label="Hired" value={filtered.filter((r) => r.application.status === "approved").length} />
        <Metric label="Not selected" value={filtered.filter((r) => r.application.status === "rejected").length} />
        <Metric
          label="Application → hire"
          value={filtered.length ? `${Math.round((filtered.filter((r) => r.application.status === "approved").length / filtered.length) * 100)}%` : "—"}
        />
      </Metrics>

      <RangeFilter path={PATH} params={params} range={range} allowAll hidden={["q", "status", "store", "sort", "dir"]} />

      <FilterBar path={PATH} keep={{ sort: params.sort, dir: params.dir, range: params.range, from: params.from, to: params.to }}>
        <SearchFilter value={params.q} placeholder="Worker, shift, store or location" />
        <SelectFilter
          name="status"
          label="Status"
          value={params.status}
          options={[
            { value: "", label: "Any" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Hired" },
            { value: "rejected", label: "Not selected" },
          ]}
        />
        <SelectFilter name="store" label="Store" value={params.store} options={storeOptions} />
      </FilterBar>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState title="No applications match" text="Try another status, store or period." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortHeader path={PATH} params={params} column="applied" label="Applied" />
                    <SortHeader path={PATH} params={params} column="worker" label="Worker" />
                    <th>Shift</th>
                    <SortHeader path={PATH} params={params} column="store" label="Retailer / store" />
                    <th>Location</th>
                    <SortHeader path={PATH} params={params} column="shiftDate" label="Shift date" />
                    <SortHeader path={PATH} params={params} column="status" label="Application" />
                    <th>Shift status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ application, shift, store, worker, workerName }) => {
                    const outcome = APPLICATION_STATUS[application.status];
                    return (
                      <tr key={application.id}>
                        <td className={styles.nowrap}>
                          {formatDate(application.applied_at)}
                          <span className={styles.sub}>{formatTime(application.applied_at)}</span>
                        </td>
                        <td>
                          {worker ? (
                            <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>
                              {workerName ?? "Worker"}
                            </Link>
                          ) : (
                            "Unknown"
                          )}
                        </td>
                        <td>
                          {shift ? (
                            <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                              {shift.task_type}
                            </Link>
                          ) : (
                            "Deleted shift"
                          )}
                        </td>
                        <td>
                          {store ? (
                            <Link className={styles.primaryCell} href={`/super-admin/retailers/${store.id}`}>
                              {store.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{shift?.shift_location ?? store?.address ?? "—"}</td>
                        <td className={styles.nowrap}>
                          {shift ? formatDate(shift.start_time) : "—"}
                          {shift ? (
                            <span className={styles.sub}>
                              {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone={outcome.tone}>{outcome.label}</Badge>
                          {application.reviewed_at ? <span className={styles.sub}>{formatDate(application.reviewed_at)}</span> : null}
                        </td>
                        <td>{shift ? <Badge tone={SHIFT_STATUS[shift.status].tone}>{SHIFT_STATUS[shift.status].label}</Badge> : "—"}</td>
                      </tr>
                    );
                  })}
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
