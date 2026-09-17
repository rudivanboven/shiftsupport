import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { PayrollStatusForm } from "@/components/super-admin/forms";
import {
  FilterBar,
  Metric,
  Metrics,
  Notice,
  Pagination,
  SearchFilter,
  SelectFilter,
  hours as hoursText,
  matchesSearch,
  money,
  paginate,
  searchText,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { STAGE_HELP, STAGE_LABELS, STAGE_TONES } from "@/lib/admin/labels";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, payrollStage, workerContact, type PayrollStage } from "@/lib/admin/snapshot";
import { formatDate, formatDateTime } from "@/lib/format";
import { WORKER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Payroll / ADP | Operations Control Center" };

const PATH = "/super-admin/payroll";

const STAGE_ORDER: PayrollStage[] = [
  "awaiting_completion",
  "awaiting_hours",
  "awaiting_approval",
  "hours_rejected",
  "ready",
  "exported",
  "submitted",
  "processed",
  "error",
  "scheduled",
];

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; store?: string; page?: string; exported?: string; error?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const snapshot = await loadSnapshot();

  const missing = snapshot.warnings.includes("shift_time_entries");

  const hired = snapshot.shifts.filter((shift) => shift.accepted_by && shift.status !== "cancelled");

  const rowsAll = hired
    .map((shift) => {
      const entry = snapshot.entryByShift.get(shift.id);
      const worker = snapshot.workerById.get(shift.accepted_by!);
      const info = worker ? workerContact(snapshot, worker) : null;
      const store = snapshot.storeById.get(shift.store_id);
      const stage = payrollStage(shift, entry);
      const approved = entry?.approval_status === "approved" ? entry.approved_hours ?? 0 : 0;
      return {
        shift,
        entry,
        worker,
        workerName: info?.name ?? null,
        store,
        stage,
        approved,
        grossCents: Math.round(approved * (entry?.worker_hourly_rate ?? WORKER_HOURLY_RATE) * 100),
      };
    })
    .sort((a, b) => b.shift.start_time.localeCompare(a.shift.start_time));

  const q = searchText(params.q);
  const filtered = rowsAll.filter((row) => {
    if (!matchesSearch(q, row.workerName, row.shift.task_type, row.store?.name)) return false;
    if (params.stage && params.stage !== "any" && row.stage !== params.stage) return false;
    if (params.store && row.shift.store_id !== params.store) return false;
    return true;
  });

  const { page, pageCount, rows } = paginate(filtered, params.page, PAGE_SIZE);

  const counts = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, rowsAll.filter((r) => r.stage === stage).length])) as Record<PayrollStage, number>;
  const readyRows = rowsAll.filter((r) => r.stage === "ready");
  const exportedRows = filtered.filter((r) => r.stage === "exported");
  const submittedRows = filtered.filter((r) => r.stage === "submitted");
  const approvedHoursTotal = rowsAll.reduce((sum, r) => sum + r.approved, 0);

  const storeOptions = [
    { value: "", label: "All stores" },
    ...snapshot.stores.slice().sort((a, b) => a.name.localeCompare(b.name)).map((store) => ({ value: store.id, label: store.name })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Payroll / ADP"
        description="Approved actual hours ready to go to ADP. ShiftSupport never pays workers directly — ADP runs payroll, taxes and payment."
      />

      {missing ? (
        <Notice>
          <p>
            The worked-hours tables are not in the database yet. Apply{" "}
            <code>supabase/migrations/0010_operations_control_center.sql</code> in the Supabase SQL editor to enable this page.
          </p>
        </Notice>
      ) : null}

      {params.exported ? (
        <Notice tone="info">
          <p>
            {params.exported} payroll line{params.exported === "1" ? "" : "s"} exported and marked as <strong>Exported</strong>. Upload the
            CSV to ADP, then mark the lines as submitted.
          </p>
        </Notice>
      ) : null}
      {params.error ? (
        <Notice>
          <p>{params.error === "none" ? "There was nothing ready to export." : "The export could not be completed. Please try again."}</p>
        </Notice>
      ) : null}

      <Metrics tone="finance">
        <Metric label="Awaiting completion" value={counts.awaiting_completion} hint="Store has not confirmed the shift" />
        <Metric label="Awaiting hours" value={counts.awaiting_hours} hint="Completed, hours not recorded" />
        <Metric label="Awaiting approval" value={counts.awaiting_approval} hint="Hours recorded, not approved" />
        <Metric label="Ready for payroll" value={counts.ready} />
        <Metric label="Exported" value={counts.exported} />
        <Metric label="Submitted to ADP" value={counts.submitted} />
        <Metric label="Processed" value={counts.processed} />
        <Metric label="Approved hours (all time)" value={hoursText(approvedHoursTotal || null)} hint={`Gross ${money(Math.round(approvedHoursTotal * WORKER_HOURLY_RATE * 100))}`} />
      </Metrics>

      <FilterBar path={PATH}>
        <SearchFilter value={params.q} placeholder="Worker, shift or store" />
        <SelectFilter
          name="stage"
          label="Payroll stage"
          value={params.stage}
          options={[{ value: "", label: "Any" }, ...STAGE_ORDER.map((stage) => ({ value: stage, label: `${STAGE_LABELS[stage]} (${counts[stage]})` }))]}
        />
        <SelectFilter name="store" label="Store" value={params.store} options={storeOptions} />
      </FilterBar>

      <div className={styles.detailGrid}>
        <Panel title="Export approved hours" description="An interim manual workflow — a CSV an operator uploads or keys into ADP. This is an export, not an ADP API integration.">
          <form method="post" action="/super-admin/payroll/export" className={styles.inlineForm}>
            <p className={styles.metricHint}>
              {readyRows.length} line{readyRows.length === 1 ? "" : "s"} ready ·{" "}
              {hoursText(readyRows.reduce((sum, r) => sum + r.approved, 0) || null)} ·{" "}
              {money(readyRows.reduce((sum, r) => sum + r.grossCents, 0))} gross
            </p>
            <button type="submit" className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled={readyRows.length === 0}>
              Download payroll CSV ({readyRows.length})
            </button>
            <p className={styles.metricHint}>
              Downloading marks these lines as <strong>Exported</strong> and writes an audit entry. Workers with no ADP employee id are
              exported with an empty id column — set it on the worker&apos;s page.
            </p>
          </form>
        </Panel>

        <Panel title="Move lines along" description="Manual status steps until an ADP integration exists. Applies to the rows matching the filters above.">
          <div className={styles.stack}>
            <PayrollStatusForm
              shiftIds={exportedRows.map((r) => r.shift.id)}
              status="submitted"
              label="Mark exported rows as submitted to ADP"
              needsRef
            />
            <PayrollStatusForm
              shiftIds={submittedRows.map((r) => r.shift.id)}
              status="processed"
              label="Mark submitted rows as processed"
            />
            <PayrollStatusForm
              shiftIds={[...exportedRows, ...submittedRows].map((r) => r.shift.id)}
              status="error"
              label="Flag a payroll error"
              needsError
            />
          </div>
        </Panel>
      </div>

      <Panel title="Payroll queue" description="One line per hired shift. Payroll uses approved actual hours, never scheduled duration." flush>
        {rows.length === 0 ? (
          <EmptyState title="Nothing here" text="No hired shifts match these filters." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Shift</th>
                    <th>Store</th>
                    <th>Shift date</th>
                    <th className={styles.num}>Scheduled</th>
                    <th className={styles.num}>Approved</th>
                    <th className={styles.num}>Rate</th>
                    <th className={styles.num}>Gross</th>
                    <th>Stage</th>
                    <th>ADP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ shift, entry, worker, workerName, store, stage, approved, grossCents }) => (
                    <tr key={shift.id}>
                      <td>
                        {worker ? (
                          <Link className={styles.primaryCell} href={`/super-admin/workers/${worker.id}`}>
                            {workerName ?? "Worker"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <span className={styles.sub}>
                          {snapshot.payrollIds.find((p) => p.worker_id === worker?.id)?.external_employee_id ?? "No ADP id"}
                        </span>
                      </td>
                      <td>
                        <Link className={styles.primaryCell} href={`/super-admin/shifts/${shift.id}`}>
                          {shift.task_type}
                        </Link>
                      </td>
                      <td>{store?.name ?? "—"}</td>
                      <td className={styles.nowrap}>{formatDate(shift.start_time)}</td>
                      <td className={styles.num}>{hoursText(shift.duration)}</td>
                      <td className={styles.num}>
                        {hoursText(approved || null)}
                        {entry && entry.reported_hours !== null && entry.approval_status === "approved" && entry.approved_hours !== entry.reported_hours ? (
                          <span className={styles.sub}>recorded {hoursText(entry.reported_hours)}</span>
                        ) : null}
                      </td>
                      <td className={styles.num}>${entry?.worker_hourly_rate ?? WORKER_HOURLY_RATE}/h</td>
                      <td className={styles.num}>{approved ? money(grossCents) : "—"}</td>
                      <td>
                        <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
                        <span className={styles.sub}>{STAGE_HELP[stage]}</span>
                      </td>
                      <td>
                        {entry?.payroll_submitted_at ? <span className={styles.sub} style={{ marginTop: 0 }}>Submitted {formatDateTime(entry.payroll_submitted_at)}</span> : null}
                        {entry?.payroll_processed_at ? <span className={styles.sub}>Processed {formatDateTime(entry.payroll_processed_at)}</span> : null}
                        {entry?.payroll_exported_at && !entry.payroll_submitted_at ? <span className={styles.sub} style={{ marginTop: 0 }}>Exported {formatDateTime(entry.payroll_exported_at)}</span> : null}
                        {entry?.payroll_external_ref ? <span className={styles.sub}>Ref {entry.payroll_external_ref}</span> : null}
                        {entry?.payroll_error ? <span className={`${styles.sub} ${styles.warnText}`}>{entry.payroll_error}</span> : null}
                        {!entry?.payroll_exported_at && !entry?.payroll_error ? <span className={styles.sub} style={{ marginTop: 0 }}>—</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={filtered.length} />
          </>
        )}
      </Panel>

      <div className={styles.spacer} aria-hidden="true" />

      <Panel title="Before automatic ADP submission" description="This area is ADP-ready, but no ADP API is implemented: nothing here calls ADP.">
        <p className={styles.metricHint}>Still needed from the client:</p>
        <ul style={{ margin: "8px 0 14px", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Which ADP product / module is in use (RUN, Workforce Now, Vantage, …).</li>
          <li>Whether API access is enabled on that plan, and which scopes were granted.</li>
          <li>API credentials and the certificate/mTLS setup ADP requires — to be stored server-side only.</li>
          <li>How ADP identifies each employee (associate OID, worker id, file number) and how it maps to a ShiftSupport worker.</li>
          <li>The exact time-entry endpoint, pay period rules and cut-off times.</li>
          <li>Whether hours should be submitted through the API at all, or uploaded/keyed manually.</li>
          <li>How corrections after submission should be handled.</li>
        </ul>
        <p className={styles.metricHint}>
          When that is known, add an adapter in <code>lib/payroll/</code> implementing <code>PayrollProvider</code> and set{" "}
          <code>PAYROLL_PROVIDER</code>. The queue, statuses, approvals and audit trail above do not need to change.
        </p>
      </Panel>
    </>
  );
}
