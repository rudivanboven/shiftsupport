import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import { Metric, Metrics, Notice, Pagination, SearchFilter, FilterBar, matchesSearch, paginate, searchText } from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { adminDb, requireSuperAdmin } from "@/lib/admin/auth";
import { retailerRows, workerRows } from "@/lib/admin/people";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { getEmailProvider } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Communications | Operations Control Center" };

const PATH = "/super-admin/communications";

interface CommunicationRow {
  id: string;
  created_at: string;
  recipient_type: string;
  recipient_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: string;
  provider: string | null;
  error: string | null;
  admin_user_id: string | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: "approved" | "pending" | "cancelled" | "neutral" }> = {
  sent: { label: "Sent", tone: "approved" },
  handed_to_mail_client: { label: "Opened in mail app", tone: "neutral" },
  not_configured: { label: "Not configured", tone: "pending" },
  failed: { label: "Failed", tone: "cancelled" },
};

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tab?: string }>;
}) {
  // Authorise before touching any data: the layout renders in parallel with
  // the page, so the page cannot rely on the layout's guard having run.
  await requireSuperAdmin();

  const params = await searchParams;
  const snapshot = await loadSnapshot();
  const db = await adminDb();

  const { data, error } = await db
    .from("admin_communications")
    .select("id,created_at,recipient_type,recipient_id,recipient_email,subject,status,provider,error,admin_user_id")
    .order("created_at", { ascending: false })
    .limit(500);

  const history = ((data ?? []) as CommunicationRow[]);
  const email = getEmailProvider();

  const tab = params.tab === "retailers" ? "retailers" : params.tab === "history" ? "history" : "workers";
  const q = searchText(params.q);

  const workers = workerRows(snapshot).filter((row) => matchesSearch(q, row.name, row.email, row.phone));
  const retailers = retailerRows(snapshot).filter((row) => matchesSearch(q, row.storeName, row.contactName, row.contactEmail));
  const filteredHistory = history.filter((row) => matchesSearch(q, row.recipient_email, row.subject, row.recipient_type));

  const list = tab === "workers" ? workers : tab === "retailers" ? retailers : filteredHistory;
  const { page, pageCount, rows } = paginate(list as unknown[], params.page, PAGE_SIZE);

  const adminEmails = new Map(snapshot.profiles.map((p) => [p.id, p.email]));

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Communications"
        description="Reach a worker or retailer by email, phone or WhatsApp, and see what operations has sent."
      />

      {email.configured ? (
        <Notice tone="info">
          <p>
            Email is sent through <strong>{email.provider.id}</strong> from <strong>{email.from}</strong>.
          </p>
        </Notice>
      ) : (
        <Notice>
          <p>
            <strong>Email sending is not configured.</strong> {email.reason}
          </p>
          <p>
            The composer still works: it validates the message, records the attempt, and offers to open it in your own mail
            app. To send from the server, add an adapter in <code>lib/email/</code> and set <code>ADMIN_EMAIL_PROVIDER</code>{" "}
            and <code>ADMIN_EMAIL_FROM</code> (plus that provider&apos;s API key) as server-side environment variables. No
            provider or credential is assumed here.
          </p>
        </Notice>
      )}

      <Metrics tone="neutral">
        <Metric label="Messages recorded" value={history.length} hint="Most recent 500" />
        <Metric label="Sent" value={history.filter((r) => r.status === "sent").length} />
        <Metric label="Opened in mail app" value={history.filter((r) => r.status === "handed_to_mail_client").length} />
        <Metric label="Failed / not configured" value={history.filter((r) => r.status === "failed" || r.status === "not_configured").length} />
      </Metrics>

      <div className={`${styles.presets} ${styles.tabRow}`}>
        {[
          { key: "workers", label: `Workers (${workers.length})` },
          { key: "retailers", label: `Retailers (${retailers.length})` },
          { key: "history", label: `History (${filteredHistory.length})` },
        ].map((item) => (
          <Link
            key={item.key}
            href={`${PATH}?tab=${item.key}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
            className={`${styles.preset} ${tab === item.key ? styles.presetActive : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <FilterBar path={PATH} keep={{ tab }}>
        <SearchFilter value={params.q} placeholder={tab === "history" ? "Recipient or subject" : "Name, email or phone"} />
      </FilterBar>

      <Panel flush>
        {error ? (
          <EmptyState title="Communication history unavailable" text={`Could not read admin_communications: ${error.message}`} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to show" text="Try a different search." />
        ) : tab === "history" ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Sent by</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as CommunicationRow[]).map((row) => {
                    const status = STATUS_LABELS[row.status] ?? { label: row.status, tone: "neutral" as const };
                    return (
                      <tr key={row.id}>
                        <td className={styles.nowrap}>{formatDateTime(row.created_at)}</td>
                        <td>
                          {row.recipient_id ? (
                            <Link
                              className={styles.primaryCell}
                              href={row.recipient_type === "worker" ? `/super-admin/workers/${row.recipient_id}` : `/super-admin/retailers/${row.recipient_id}`}
                            >
                              {row.recipient_email ?? row.recipient_type}
                            </Link>
                          ) : (
                            row.recipient_email ?? "—"
                          )}
                          <span className={styles.sub}>{row.recipient_type}</span>
                        </td>
                        <td>{row.subject ?? "—"}</td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {row.error ? <span className={`${styles.sub} ${styles.warnText}`}>{row.error}</span> : null}
                        </td>
                        <td>{row.admin_user_id ? adminEmails.get(row.admin_user_id) ?? <span className={styles.mono}>{row.admin_user_id.slice(0, 8)}…</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={{ ...params, tab }} page={page} pageCount={pageCount} total={filteredHistory.length} />
          </>
        ) : tab === "workers" ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Reach out</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as ReturnType<typeof workerRows>).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link className={styles.primaryCell} href={`/super-admin/workers/${row.id}`}>
                          {row.name ?? "Unnamed worker"}
                        </Link>
                      </td>
                      <td>{row.email ?? "—"}</td>
                      <td>{row.phone ?? "—"}</td>
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
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={{ ...params, tab }} page={page} pageCount={pageCount} total={workers.length} />
          </>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Reach out</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as ReturnType<typeof retailerRows>).map((row) => (
                    <tr key={row.storeId}>
                      <td>
                        <Link className={styles.primaryCell} href={`/super-admin/retailers/${row.storeId}`}>
                          {row.storeName}
                        </Link>
                      </td>
                      <td>{row.contactName ?? "—"}</td>
                      <td>{row.contactEmail ?? "—"}</td>
                      <td>{row.contactPhone ?? row.storePhone ?? "—"}</td>
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
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path={PATH} params={{ ...params, tab }} page={page} pageCount={pageCount} total={retailers.length} />
          </>
        )}
      </Panel>
    </>
  );
}
