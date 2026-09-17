import type { Metadata } from "next";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { FilterBar, Metric, Metrics, Pagination, SearchFilter, SelectFilter, matchesSearch, paginate, searchText } from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { adminDb, requireSuperAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Audit log | Operations Control Center" };

const PATH = "/super-admin/audit";

interface AuditRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
}

const toneFor = (action: string) => {
  if (action.startsWith("access.")) return "approved" as const;
  if (action.includes("rejected") || action.includes("error") || action.includes("revoked") || action.includes("failed")) return "cancelled" as const;
  if (action.startsWith("payroll.")) return "filled" as const;
  if (action.startsWith("communication.")) return "open" as const;
  return "neutral" as const;
};

const summarise = (row: AuditRow) => {
  const meta = row.metadata ?? {};
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined || value === "") continue;
    if (key === "shift_ids") {
      parts.push(`${Array.isArray(value) ? value.length : 1} shifts`);
      continue;
    }
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${key.replace(/_/g, " ")}: ${text.slice(0, 80)}`);
  }
  return parts.join(" · ");
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; area?: string; page?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const db = await adminDb();

  const { data, error } = await db
    .from("admin_audit_log")
    .select("id,created_at,actor_user_id,actor_email,action,target_type,target_id,metadata")
    .order("created_at", { ascending: false })
    .limit(1000);

  const all = (data ?? []) as AuditRow[];
  const q = searchText(params.q);

  const filtered = all.filter((row) => {
    if (params.area && !row.action.startsWith(`${params.area}.`)) return false;
    return matchesSearch(q, row.action, row.actor_email, row.target_id, row.target_type, JSON.stringify(row.metadata ?? {}));
  });

  const { page, pageCount, rows } = paginate(filtered, params.page, PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Sensitive administrative actions, newest first. The table is append-only in the database: entries cannot be edited or deleted, and no secrets are recorded."
      />

      <Metrics tone="neutral">
        <Metric label="Entries" value={all.length} hint="Most recent 1,000" />
        <Metric label="Access changes" value={all.filter((r) => r.action.startsWith("access.")).length} />
        <Metric label="Payroll actions" value={all.filter((r) => r.action.startsWith("payroll.")).length} />
        <Metric label="Communications" value={all.filter((r) => r.action.startsWith("communication.")).length} />
      </Metrics>

      <FilterBar path={PATH}>
        <SearchFilter value={params.q} placeholder="Action, admin, target or detail" />
        <SelectFilter
          name="area"
          label="Area"
          value={params.area}
          options={[
            { value: "", label: "All" },
            { value: "access", label: "Admin access" },
            { value: "payroll", label: "Payroll & hours" },
            { value: "communication", label: "Communications" },
            { value: "export", label: "Exports" },
          ]}
        />
      </FilterBar>

      <Panel flush>
        {error ? (
          <EmptyState title="Could not load the audit log" text={error.message} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing logged yet" text="Grants, hours approvals, payroll steps and admin emails appear here." />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.nowrap}>{formatDateTime(row.created_at)}</td>
                      <td>
                        {row.actor_email ?? "—"}
                        {row.actor_user_id ? <span className={styles.sub}>{row.actor_user_id.slice(0, 8)}…</span> : null}
                      </td>
                      <td>
                        <Badge tone={toneFor(row.action)}>{row.action.replace(/^[a-z]+\./, "").replace(/_/g, " ")}</Badge>
                        <span className={styles.sub}>{row.action.split(".")[0]}</span>
                      </td>
                      <td>
                        {row.target_type ?? "—"}
                        {row.target_id ? <span className={`${styles.sub} ${styles.mono}`}>{row.target_id}</span> : null}
                      </td>
                      <td>{summarise(row) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={filtered.length} />
          </>
        )}
      </Panel>
    </>
  );
}
