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
  hours as hoursText,
  matchesSearch,
  money,
  paginate,
  searchText,
  sortRows,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { parseRange, wallClockInRange } from "@/lib/admin/dates";
import { PAYMENT_STATUS, SHIFT_STATUS, STAGE_LABELS, STAGE_TONES } from "@/lib/admin/labels";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { isOpenShift, loadSnapshot, payrollStage, workerContact } from "@/lib/admin/snapshot";
import { loadSeriesIndex } from "@/lib/admin/series";
import { describeDays } from "@/lib/recurrence";
import { formatDate, formatTime } from "@/lib/format";
import { RETAILER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Shifts | Operations Control Center" };

const PATH = "/super-admin/shifts";

type StatusFilter = "any" | "draft" | "open" | "hired" | "completed" | "cancelled";

export default async function ShiftOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    hired?: string;
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
  // Shift dates are store wall-clock times, so the date filter is off by
  // default — operations usually want every shift, not a window.
  const range = parseRange(params, "all");
  const [snapshot, seriesIndex] = await Promise.all([loadSnapshot(), loadSeriesIndex()]);

  const q = searchText(params.q);
  const status = (params.status ?? "any") as StatusFilter;

  const filtered = snapshot.shifts.filter((shift) => {
    const store = snapshot.storeById.get(shift.store_id);
    const worker = shift.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
    const workerName = worker ? workerContact(snapshot, worker).name : null;

    if (!matchesSearch(q, shift.task_type, shift.shift_location, store?.name, store?.address, workerName)) return false;
    if (params.store && shift.store_id !== params.store) return false;
    if (range.from && !wallClockInRange(shift.start_time, range)) return false;

    switch (status) {
      case "draft":
        if (shift.status !== "draft") return false;
        break;
      case "open":
        if (!isOpenShift(shift)) return false;
        break;
      case "hired":
        if (!shift.accepted_by || shift.status === "cancelled") return false;
        break;
      case "completed":
        if (shift.status !== "completed") return false;
        break;
      case "cancelled":
        if (shift.status !== "cancelled") return false;
        break;
      default:
        break;
    }

    if (params.payment === "paid" && shift.payment_status !== "paid") return false;
    if (params.payment === "unpaid" && ["paid", "legacy"].includes(shift.payment_status)) return false;
    if (params.payment === "legacy" && shift.payment_status !== "legacy") return false;
    if (params.hired === "yes" && !shift.accepted_by) return false;
    if (params.hired === "no" && shift.accepted_by) return false;

    return true;
  });

  const sorted = sortRows(filtered, params.dir, (shift) => {
    switch (params.sort) {
      case "store":
        return snapshot.storeById.get(shift.store_id)?.name?.toLowerCase() ?? "";
      case "created":
        return shift.created_at ?? "";
      case "applicants":
        return (snapshot.applicationsByShift.get(shift.id) ?? []).length;
      case "amount":
        return shift.amount_paid_cents ?? 0;
      default:
        return shift.start_time;
    }
  });

  const { page, pageCount, rows } = paginate(sorted, params.page, PAGE_SIZE);

  const scheduledHours = filtered.reduce((sum, shift) => sum + shift.duration, 0);
  const paidCents = filtered.reduce((sum, shift) => sum + (shift.payment_status === "paid" ? shift.amount_paid_cents ?? 0 : 0), 0);

  const storeOptions = [
    { value: "", label: "All stores" },
    ...snapshot.stores
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((store) => ({ value: store.id, label: store.name })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Shift operations"
        description="Every shift with its schedule, payment, applicants, hire and payroll readiness."
      />

      <Metrics tone="shifts">
        <Metric label="Shifts matching" value={filtered.length} hint={`of ${snapshot.shifts.length} total`} />
        <Metric label="Scheduled hours" value={hoursText(scheduledHours)} />
        <Metric label="Retailer paid" value={money(paidCents)} hint="Stripe-confirmed" />
        <Metric label="Hired" value={filtered.filter((s) => s.accepted_by && s.status !== "cancelled").length} />
        <Metric label="Completed" value={filtered.filter((s) => s.status === "completed").length} />
      </Metrics>

      <RangeFilter path={PATH} params={params} range={range} allowAll hidden={["q", "status", "payment", "hired", "store", "sort", "dir"]} />

      <FilterBar path={PATH} keep={{ sort: params.sort, dir: params.dir, range: params.range, from: params.from, to: params.to }}>
        <SearchFilter value={params.q} placeholder="Task, store, location or worker" />
        <SelectFilter
          name="status"
          label="Status"
          value={params.status}
          options={[
            { value: "", label: "Any" },
            { value: "draft", label: "Awaiting payment" },
            { value: "open", label: "Open" },
            { value: "hired", label: "Hired" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <SelectFilter
          name="payment"
          label="Payment"
          value={params.payment}
          options={[
            { value: "", label: "Any" },
            { value: "paid", label: "Paid" },
            { value: "unpaid", label: "Not paid" },
            { value: "legacy", label: "Pre-Stripe" },
          ]}
        />
        <SelectFilter
          name="hired"
          label="Hiring"
          value={params.hired}
          options={[
            { value: "", label: "Any" },
            { value: "yes", label: "Hired" },
            { value: "no", label: "Not hired" },
          ]}
        />
        <SelectFilter name="store" label="Store" value={params.store} options={storeOptions} />
      </FilterBar>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState title="No shifts match" text="Try a different filter or clear the search." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Shift</th>
                    <SortHeader path={PATH} params={params} column="store" label="Retailer / store" />
                    <SortHeader path={PATH} params={params} column="date" label="Date & time" />
                    <th className={styles.num}>Scheduled</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <SortHeader path={PATH} params={params} column="amount" label="Retailer paid" numeric />
                    <SortHeader path={PATH} params={params} column="applicants" label="Apps" numeric />
                    <th>Hired worker</th>
                    <th>Payroll</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((shift) => {
                    const store = snapshot.storeById.get(shift.store_id);
                    const worker = shift.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
                    const entry = snapshot.entryByShift.get(shift.id);
                    const stage = payrollStage(shift, entry);
                    const status = SHIFT_STATUS[shift.status];
                    const payment = PAYMENT_STATUS[shift.payment_status];
                    const applicants = snapshot.applicationsByShift.get(shift.id) ?? [];
                    const series = seriesIndex.get(shift.id);

                    return (
                      <tr key={shift.id}>
                        <td>
                          <Link className={styles.primaryCell} href={`${PATH}/${shift.id}`}>
                            {shift.task_type}
                          </Link>
                          <span className={styles.sub}>{shift.shift_location ?? store?.address ?? "No location"}</span>
                          {series ? (
                            <span className={styles.sub}>Recurring · {describeDays(series.daysOfWeek)}</span>
                          ) : null}
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
                        <td className={styles.nowrap}>
                          {formatDate(shift.start_time)}
                          <span className={styles.sub}>
                            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                          </span>
                        </td>
                        <td className={styles.num}>
                          {hoursText(shift.duration)}
                          <span className={styles.sub}>${shift.hourly_rate ?? RETAILER_HOURLY_RATE}/h</span>
                        </td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>
                          <Badge tone={payment.tone}>{payment.label}</Badge>
                        </td>
                        <td className={styles.num}>{shift.amount_paid_cents ? money(shift.amount_paid_cents) : "—"}</td>
                        <td className={styles.num}>
                          {applicants.length}
                          {applicants.some((a) => a.status === "pending") ? (
                            <span className={styles.sub}>{applicants.filter((a) => a.status === "pending").length} pending</span>
                          ) : null}
                        </td>
                        <td>
                          {worker ? (
                            <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>
                              {workerContact(snapshot, worker).name ?? "Worker"}
                            </Link>
                          ) : (
                            "—"
                          )}
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
            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={sorted.length} />
          </>
        )}
      </Panel>
    </>
  );
}
