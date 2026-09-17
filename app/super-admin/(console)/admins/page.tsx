import type { Metadata } from "next";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { GrantAdminForm, RevokeAdminForm } from "@/components/super-admin/forms";
import { Metric, Metrics, Notice } from "@/components/super-admin/ui";
import { adminDb, requireSuperAdmin } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Admin access | Operations Control Center" };

interface AdminRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_primary: boolean;
  status: string;
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  note: string | null;
}

export default async function AdminAccessPage() {
  const me = await requireSuperAdmin();
  const db = await adminDb();

  const { data, error } = await db
    .from("super_admins")
    .select("user_id,email,full_name,is_primary,status,granted_at,granted_by,revoked_at,note")
    .order("status", { ascending: true })
    .order("granted_at", { ascending: true });

  const rows = (data ?? []) as AdminRow[];
  const active = rows.filter((row) => row.status === "active");
  const byId = new Map(rows.map((row) => [row.user_id, row.email]));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Admin access"
        description="Who can use the Operations Control Center. Access lives in its own table — no signup path can grant it, and no one can grant it to themselves."
      />

      <Metrics tone="neutral">
        <Metric label="Active Super Admins" value={active.length} />
        <Metric label="Revoked" value={rows.filter((row) => row.status === "revoked").length} />
        <Metric label="You are" value={me.isPrimary ? "Primary" : "Super Admin"} hint={me.email} />
      </Metrics>

      {me.isPrimary ? (
        <Panel
          title="Grant access"
          description="The login must already exist in Supabase Auth, must have confirmed its email, and must not be a worker or retailer account."
        >
          <GrantAdminForm />
          <p className={`${styles.metricHint} ${styles.noteAfter}`}>
            To create a new operations login: Supabase Dashboard → Authentication → Users → Add user, with a strong password
            and &quot;Auto confirm user&quot; ticked. Then grant access here.
          </p>
        </Panel>
      ) : (
        <Notice tone="info">
          <p>Only the primary Super Admin can grant or revoke access. You can see the list below.</p>
        </Notice>
      )}

      <div className={styles.spacer} aria-hidden="true" />

      <Panel title="Super Admin accounts" flush>
        {error ? (
          <EmptyState title="Could not load the admin list" text={error.message} />
        ) : rows.length === 0 ? (
          <EmptyState title="No Super Admins" text="Bootstrap the primary Super Admin with the SQL at the end of migration 0010." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Granted</th>
                  <th>Granted by</th>
                  <th>Note</th>
                  {me.isPrimary ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isMe = row.user_id === me.user.id;
                  return (
                    <tr key={row.user_id}>
                      <td>
                        <span className={styles.primaryCell}>{row.full_name ?? row.email ?? "Unknown"}</span>
                        <span className={styles.sub}>{row.email ?? "—"}</span>
                      </td>
                      <td>{row.is_primary ? <Badge tone="approved">Primary</Badge> : <Badge tone="neutral">Super Admin</Badge>}</td>
                      <td>
                        {row.status === "active" ? <Badge tone="open">Active</Badge> : <Badge tone="cancelled">Revoked</Badge>}
                        {row.revoked_at ? <span className={styles.sub}>{formatDateTime(row.revoked_at)}</span> : null}
                      </td>
                      <td className={styles.nowrap}>{formatDateTime(row.granted_at)}</td>
                      <td>{row.granted_by ? byId.get(row.granted_by) ?? <span className={styles.mono}>{row.granted_by.slice(0, 8)}…</span> : "Bootstrap"}</td>
                      <td>{row.note ?? "—"}</td>
                      {me.isPrimary ? (
                        <td>
                          {row.status !== "active" ? (
                            <span className={styles.muted}>—</span>
                          ) : isMe ? (
                            <span className={styles.muted}>You cannot change your own access</span>
                          ) : row.is_primary ? (
                            <span className={styles.muted}>Protected</span>
                          ) : (
                            <RevokeAdminForm userId={row.user_id} email={row.email ?? "this account"} />
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className={styles.spacer} aria-hidden="true" />

      <Notice tone="info">
        <p>Safeguards enforced in the database, not just in this page:</p>
        <ul>
          <li>Only the primary Super Admin can call grant or revoke.</li>
          <li>Nobody can grant or revoke their own access.</li>
          <li>The primary Super Admin cannot be revoked from the app, and the last active admin cannot be removed.</li>
          <li>Worker and retailer accounts are refused, so operations access stays separate.</li>
          <li>Every grant and revoke is written to the append-only audit log.</li>
        </ul>
      </Notice>
    </>
  );
}
