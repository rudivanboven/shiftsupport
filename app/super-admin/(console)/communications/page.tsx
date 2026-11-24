import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import ContactActions from "@/components/super-admin/ContactActions";
import {
  Metric,
  Metrics,
  Notice,
  Pagination,
  SearchFilter,
  FilterBar,
  matchesSearch,
  paginate,
  searchText,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { adminDb, requireSuperAdmin } from "@/lib/admin/auth";
import { retailerRows, workerRows } from "@/lib/admin/people";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { getEmailProvider } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Communications | Operations Control Center" };

const PATH = "/super-admin/communications";

interface AdminCommunicationDbRow {
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

interface WorkflowDeliveryDbRow {
  id: string;
  idempotency_key: string;
  email_type: "worker_welcome" | "retailer_welcome" | "retailer_shift_reminder" | string;
  recipient_role: "worker" | "retailer" | string;
  user_id: string | null;
  worker_id: string | null;
  store_id: string | null;
  recipient_email: string;
  subject: string;
  reminder_sequence: number | null;
  status: "pending" | "sent" | "failed" | "skipped" | string;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

interface InvoiceEmailLogDbRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  recipient_email: string;
  subject: string;
  status: "sent" | "failed" | string;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_by: string | null;
  created_at: string;
}

interface UnifiedCommunicationRow {
  id: string;
  created_at: string;
  recipient_type: "worker" | "retailer" | string;
  recipient_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: string;
  provider: string | null;
  error: string | null;
  admin_user_id: string | null;
  workflow_label: string;
  source: "manual" | "workflow" | "invoice";
}

const STATUS_LABELS: Record<
  string,
  { label: string; tone: "approved" | "pending" | "cancelled" | "neutral" }
> = {
  sent: { label: "Sent", tone: "approved" },
  pending: { label: "Pending", tone: "pending" },
  skipped: { label: "Skipped", tone: "neutral" },
  handed_to_mail_client: { label: "Opened in mail app", tone: "neutral" },
  not_configured: { label: "Not configured", tone: "pending" },
  failed: { label: "Failed", tone: "cancelled" },
};

function formatWorkflowTypeLabel(
  emailType: string,
  reminderSequence: number | null,
): string {
  switch (emailType) {
    case "worker_welcome":
      return "Worker Welcome Email";
    case "retailer_welcome":
      return "Retailer Welcome Email";
    case "retailer_shift_reminder":
      return reminderSequence
        ? `14-Day Retailer Reminder (#${reminderSequence})`
        : "14-Day Retailer Reminder";
    default:
      return "Automated Email";
  }
}

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

  const [adminCommsRes, workflowDeliveriesRes, invoiceEmailLogsRes] =
    await Promise.all([
      db
        .from("admin_communications")
        .select(
          "id,created_at,recipient_type,recipient_id,recipient_email,subject,status,provider,error,admin_user_id",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("email_workflow_deliveries")
        .select(
          "id,idempotency_key,email_type,recipient_role,user_id,worker_id,store_id,recipient_email,subject,reminder_sequence,status,provider,provider_message_id,last_error,sent_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("retailer_invoice_email_logs")
        .select(
          "id,invoice_id,invoice_number,recipient_email,subject,status,provider,provider_message_id,error,sent_by,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  // Lookup maps so automated welcome/reminder rows link cleanly to Worker or Store detail pages
  const workerIdByAuthUser = new Map<string, string>();
  for (const w of snapshot.workers) {
    if (w.auth_user_id) workerIdByAuthUser.set(w.auth_user_id, w.id);
  }
  const storeIdByAuthUser = new Map<string, string>();
  const storeIdByEmail = new Map<string, string>();
  for (const su of snapshot.storeUsers) {
    if (su.auth_user_id && !storeIdByAuthUser.has(su.auth_user_id)) {
      storeIdByAuthUser.set(su.auth_user_id, su.store_id);
    }
    if (su.email && !storeIdByEmail.has(su.email.toLowerCase())) {
      storeIdByEmail.set(su.email.toLowerCase(), su.store_id);
    }
  }

  const manualRows: UnifiedCommunicationRow[] = (
    (adminCommsRes.data ?? []) as AdminCommunicationDbRow[]
  ).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    recipient_type: row.recipient_type,
    recipient_id: row.recipient_id,
    recipient_email: row.recipient_email,
    subject: row.subject,
    status: row.status,
    provider: row.provider,
    error: row.error,
    admin_user_id: row.admin_user_id,
    workflow_label:
      row.subject && row.subject.includes("ShiftSupport Invoice")
        ? "Retailer Invoice Email"
        : "Manual Outreach",
    source:
      row.subject && row.subject.includes("ShiftSupport Invoice")
        ? "invoice"
        : "manual",
  }));

  const workflowRows: UnifiedCommunicationRow[] = (
    (workflowDeliveriesRes.data ?? []) as WorkflowDeliveryDbRow[]
  ).map((row) => {
    const resolvedRecipientId =
      row.recipient_role === "worker"
        ? (row.worker_id ??
          (row.user_id ? (workerIdByAuthUser.get(row.user_id) ?? null) : null))
        : (row.store_id ??
          (row.user_id ? (storeIdByAuthUser.get(row.user_id) ?? null) : null) ??
          storeIdByEmail.get(row.recipient_email.toLowerCase()) ??
          null);

    return {
      id: `workflow-${row.id}`,
      created_at: row.sent_at ?? row.created_at,
      recipient_type: row.recipient_role,
      recipient_id: resolvedRecipientId,
      recipient_email: row.recipient_email,
      subject: row.subject,
      status: row.status,
      provider: row.provider,
      error: row.last_error,
      admin_user_id: null,
      workflow_label: formatWorkflowTypeLabel(
        row.email_type,
        row.reminder_sequence,
      ),
      source: "workflow",
    };
  });

  // Deduplicate invoice email logs that also recorded an entry in admin_communications
  const invoiceRows: UnifiedCommunicationRow[] = [];
  for (const log of (invoiceEmailLogsRes.data ?? []) as InvoiceEmailLogDbRow[]) {
    const logTimeMs = Date.parse(log.created_at);
    const alreadyInManual = manualRows.some(
      (m) =>
        m.recipient_email?.toLowerCase() === log.recipient_email.toLowerCase() &&
        m.subject === log.subject &&
        Math.abs(Date.parse(m.created_at) - logTimeMs) < 15_000,
    );
    if (alreadyInManual) continue;

    invoiceRows.push({
      id: `invoice-email-${log.id}`,
      created_at: log.created_at,
      recipient_type: "retailer",
      recipient_id:
        storeIdByEmail.get(log.recipient_email.toLowerCase()) ?? null,
      recipient_email: log.recipient_email,
      subject: log.subject,
      status: log.status,
      provider: log.provider,
      error: log.error,
      admin_user_id: log.sent_by,
      workflow_label: `Retailer Invoice Email (${log.invoice_number})`,
      source: "invoice",
    });
  }

  const history: UnifiedCommunicationRow[] = [
    ...manualRows,
    ...workflowRows,
    ...invoiceRows,
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const error =
    adminCommsRes.error && workflowDeliveriesRes.error
      ? adminCommsRes.error
      : null;

  const email = getEmailProvider();

  const tab =
    params.tab === "retailers"
      ? "retailers"
      : params.tab === "history"
        ? "history"
        : "workers";
  const q = searchText(params.q);

  const workers = workerRows(snapshot).filter((row) =>
    matchesSearch(q, row.name, row.email, row.phone),
  );
  const retailers = retailerRows(snapshot).filter((row) =>
    matchesSearch(q, row.storeName, row.contactName, row.contactEmail),
  );
  const filteredHistory = history.filter((row) =>
    matchesSearch(
      q,
      row.recipient_email,
      row.subject,
      row.recipient_type,
      row.workflow_label,
    ),
  );

  const list =
    tab === "workers"
      ? workers
      : tab === "retailers"
        ? retailers
        : filteredHistory;
  const { page, pageCount, rows } = paginate(
    list as unknown[],
    params.page,
    PAGE_SIZE,
  );

  const adminEmails = new Map(snapshot.profiles.map((p) => [p.id, p.email]));

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Communications"
        description="Reach a worker or retailer by email, phone or WhatsApp, and see all automated welcome, reminder, invoice, and operations emails sent."
      />

      {email.configured ? (
        <Notice tone="info">
          <p>
            Email is sent through <strong>{email.provider.id}</strong> from{" "}
            <strong>{email.from}</strong>.
          </p>
        </Notice>
      ) : (
        <Notice>
          <p>
            <strong>Email sending is not configured.</strong> {email.reason}
          </p>
          <p>
            The composer still works: it validates the message, records the
            attempt, and offers to open it in your own mail app. To send from the
            server, set <code>EMAIL_PROVIDER=resend</code>,{" "}
            <code>EMAIL_FROM</code>, and the server-only{" "}
            <code>RESEND_API_KEY</code> environment variable.
          </p>
        </Notice>
      )}

      <Metrics tone="neutral">
        <Metric
          label="Messages recorded"
          value={history.length}
          hint="Welcome, reminder, invoice & manual emails"
        />
        <Metric
          label="Sent"
          value={history.filter((r) => r.status === "sent").length}
        />
        <Metric
          label="Opened in mail app"
          value={
            history.filter((r) => r.status === "handed_to_mail_client").length
          }
        />
        <Metric
          label="Failed / not configured"
          value={
            history.filter(
              (r) => r.status === "failed" || r.status === "not_configured",
            ).length
          }
        />
      </Metrics>

      <div className={`${styles.presets} ${styles.tabRow}`}>
        {[
          { key: "workers", label: `Workers (${workers.length})` },
          { key: "retailers", label: `Retailers (${retailers.length})` },
          { key: "history", label: `History (${filteredHistory.length})` },
        ].map((item) => (
          <Link
            key={item.key}
            href={`${PATH}?tab=${item.key}${
              params.q ? `&q=${encodeURIComponent(params.q)}` : ""
            }`}
            className={`${styles.preset} ${
              tab === item.key ? styles.presetActive : ""
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <FilterBar path={PATH} keep={{ tab }}>
        <SearchFilter
          value={params.q}
          placeholder={
            tab === "history"
              ? "Recipient, subject or workflow type"
              : "Name, email or phone"
          }
        />
      </FilterBar>

      <Panel flush>
        {error ? (
          <EmptyState
            title="Communication history unavailable"
            text={`Could not read communication logs: ${error.message}`}
          />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to show" text="Try a different search." />
        ) : tab === "history" ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Sent by</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as UnifiedCommunicationRow[]).map((row) => {
                    const status = STATUS_LABELS[row.status] ?? {
                      label: row.status,
                      tone: "neutral" as const,
                    };
                    return (
                      <tr key={row.id}>
                        <td className={styles.nowrap}>
                          {formatDateTime(row.created_at)}
                        </td>
                        <td>
                          <strong>{row.workflow_label}</strong>
                          <span className={styles.sub}>
                            {row.provider ? `via ${row.provider}` : row.source}
                          </span>
                        </td>
                        <td>
                          {row.recipient_id ? (
                            <Link
                              className={styles.primaryCell}
                              href={
                                row.recipient_type === "worker"
                                  ? `/super-admin/workers/${row.recipient_id}`
                                  : `/super-admin/retailers/${row.recipient_id}`
                              }
                            >
                              {row.recipient_email ?? row.recipient_type}
                            </Link>
                          ) : (
                            (row.recipient_email ?? "—")
                          )}
                          <span className={styles.sub}>
                            {row.recipient_type}
                          </span>
                        </td>
                        <td>{row.subject ?? "—"}</td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {row.error ? (
                            <span
                              className={`${styles.sub} ${styles.warnText}`}
                            >
                              {row.error}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {row.admin_user_id ? (
                            (adminEmails.get(row.admin_user_id) ?? (
                              <span className={styles.mono}>
                                {row.admin_user_id.slice(0, 8)}…
                              </span>
                            ))
                          ) : row.source === "workflow" ? (
                            "Automated workflow"
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              path={PATH}
              params={{ ...params, tab }}
              page={page}
              pageCount={pageCount}
              total={filteredHistory.length}
            />
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
                        <Link
                          className={styles.primaryCell}
                          href={`/super-admin/workers/${row.id}`}
                        >
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
            <Pagination
              path={PATH}
              params={{ ...params, tab }}
              page={page}
              pageCount={pageCount}
              total={workers.length}
            />
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
                        <Link
                          className={styles.primaryCell}
                          href={`/super-admin/retailers/${row.storeId}`}
                        >
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
                            telHref:
                              row.contact.telHref ?? row.storeContact.telHref,
                            whatsappHref:
                              row.contact.whatsappHref ??
                              row.storeContact.whatsappHref,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              path={PATH}
              params={{ ...params, tab }}
              page={page}
              pageCount={pageCount}
              total={retailers.length}
            />
          </>
        )}
      </Panel>
    </>
  );
}
