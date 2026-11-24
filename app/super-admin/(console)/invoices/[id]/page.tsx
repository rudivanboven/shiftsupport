import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { GenerateOrManageInvoiceActions } from "@/components/super-admin/InvoiceActions";
import { DefinitionList, Metric, Metrics, hours as hoursText, money } from "@/components/super-admin/ui";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  createSupabaseInvoiceRepository,
  loadInvoiceEmailLogs,
} from "@/lib/invoices/server";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = {
  title: "Invoice Detail | Operations Control Center",
};

export default async function SuperAdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();

  const { id } = await params;
  const repo = createSupabaseInvoiceRepository();
  const [invoice, emailLogs] = await Promise.all([
    repo.getInvoiceById(id),
    loadInvoiceEmailLogs(id),
  ]);

  if (!invoice) notFound();

  const pdfPreviewUrl = `/api/super-admin/invoices/${invoice.id}/pdf`;
  const pdfDownloadUrl = `/api/super-admin/invoices/${invoice.id}/pdf?download=1`;

  return (
    <>
      <Link href="/super-admin/invoices" className={styles.back}>
        ← Retailer Invoices
      </Link>

      <PageHeader
        eyebrow="Retailer Invoice"
        title={`Invoice #${invoice.invoiceNumber}`}
        description={`${invoice.storeName} · Shift on ${formatDate(invoice.shiftDate)} · ${invoice.shiftTaskType}`}
        actions={
          <div className={styles.headerRow}>
            <Badge
              tone={
                invoice.invoiceStatus === "sent" || invoice.invoiceStatus === "paid"
                  ? "approved"
                  : "open"
              }
            >
              {invoice.invoiceStatus.toUpperCase()}
            </Badge>
            <Badge
              tone={
                invoice.emailStatus === "sent"
                  ? "approved"
                  : invoice.emailStatus === "failed"
                    ? "cancelled"
                    : "neutral"
              }
            >
              {invoice.emailStatus === "sent"
                ? "Email sent"
                : invoice.emailStatus === "failed"
                  ? "Email failed"
                  : "Email not sent"}
            </Badge>
          </div>
        }
      />

      <Metrics tone="finance">
        <Metric label="Invoice Number" value={`#${invoice.invoiceNumber}`} />
        <Metric label="Approved Hours" value={hoursText(invoice.approvedHours)} />
        <Metric label="Hourly Billing Rate" value={`$${invoice.hourlyRate}/hr`} />
        <Metric
          label="Grand Total"
          value={money(invoice.totalCents)}
          hint={`Currency: ${invoice.currency}`}
        />
        <Metric
          label="Emails Sent"
          value={invoice.emailSendCount}
          hint={
            invoice.emailSentAt
              ? `Last sent ${formatDateTime(invoice.emailSentAt)}`
              : "Not emailed yet"
          }
        />
      </Metrics>

      <Panel
        title="Invoice actions"
        description="Download the official PDF or send/resend it to the retailer's registered email address."
      >
        <GenerateOrManageInvoiceActions
          shiftId={invoice.shiftId}
          eligible
          autoPreviewOnGenerate={false}
          existingInvoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceStatus: invoice.invoiceStatus,
            emailStatus: invoice.emailStatus,
            emailSentAt: invoice.emailSentAt,
            emailSendCount: invoice.emailSendCount,
            contactEmail: invoice.contactEmail,
          }}
        />
      </Panel>

      <div className={styles.spacer} aria-hidden="true" />

      <div className={styles.detailGrid}>
        <Panel title="Retailer Information">
          <DefinitionList
            items={[
              ["Retailer / Business Name", invoice.retailerName],
              [
                "Store Name",
                <Link
                  key="store"
                  className={styles.primaryCell}
                  href={`/super-admin/retailers/${invoice.storeId}`}
                >
                  {invoice.storeName}
                </Link>,
              ],
              ["Full Store Address", invoice.storeAddress ?? "—"],
              ["Contact Person Name", invoice.contactPersonName ?? "—"],
              ["Mobile / Contact Number", invoice.contactPhone ?? "—"],
              ["Email Address", invoice.contactEmail ?? "—"],
            ]}
          />
        </Panel>

        <Panel title="Invoice & Shift Information">
          <DefinitionList
            items={[
              ["Invoice Number", `#${invoice.invoiceNumber}`],
              ["Invoice Date", formatDateTime(invoice.issuedAt)],
              ["Shift Date", formatDate(invoice.shiftDate)],
              [
                "Shift Details",
                <Link
                  key="shift"
                  className={styles.primaryCell}
                  href={`/super-admin/shifts/${invoice.shiftId}`}
                >
                  {invoice.shiftTaskType}
                </Link>,
              ],
              ["Shift Location", invoice.shiftLocation ?? invoice.storeAddress ?? "—"],
              ["Shift ID", <span key="sid" className={styles.mono}>{invoice.shiftId}</span>],
              ["Invoice Status", invoice.invoiceStatus.toUpperCase()],
              [
                "PDF Storage Reference",
                <span key="path" className={styles.mono}>
                  {invoice.pdfStorageBucket}/{invoice.pdfStoragePath}
                </span>,
              ],
            ]}
          />
        </Panel>
      </div>

      <div className={styles.stack}>
        <Panel
          title="Worker and Shift Cost Table"
          description="Calculated from actual approved hours worked multiplied by the applicable retailer hourly billing rate."
          flush
        >
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Worker Name</th>
                  <th className={styles.num}>Hours Worked</th>
                  <th className={styles.num}>Hourly Rate</th>
                  <th className={styles.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, idx) => (
                  <tr key={`${item.workerId}-${idx}`}>
                    <td>
                      {item.workerId ? (
                        <Link
                          className={styles.primaryCell}
                          href={`/super-admin/workers/${item.workerId}`}
                        >
                          {item.workerName}
                        </Link>
                      ) : (
                        item.workerName
                      )}
                    </td>
                    <td className={styles.num}>{item.hoursWorked.toFixed(2)} Hours</td>
                    <td className={styles.num}>${item.hourlyRate.toFixed(2)}/hr</td>
                    <td className={styles.num}>
                      <strong>{money(item.totalCents)}</strong>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className={styles.num}>
                    <strong>Subtotal</strong>
                  </td>
                  <td className={styles.num}>{money(invoice.subtotalCents)}</td>
                </tr>
                {invoice.taxCents > 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.num}>
                      <strong>Applicable Tax</strong>
                    </td>
                    <td className={styles.num}>{money(invoice.taxCents)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={3} className={styles.num}>
                    <strong>Grand Total ({invoice.currency})</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{money(invoice.totalCents)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="PDF Preview"
          description="Live preview of the generated PDF invoice stored for this shift."
        >
          <div style={{ marginBottom: 12 }} className={styles.contactBar}>
            <a
              href={pdfPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.contactBtn} ${styles.actionBtn}`}
            >
              Open PDF in new tab
            </a>
            <a
              href={pdfDownloadUrl}
              className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              Download PDF
            </a>
          </div>
          <div
            style={{
              border: "1px solid rgba(22, 48, 36, 0.16)",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <iframe
              src={pdfPreviewUrl}
              title={`Invoice #${invoice.invoiceNumber} PDF`}
              style={{ width: "100%", height: 640, border: 0, display: "block" }}
            />
          </div>
        </Panel>

        <Panel
          title="Email Delivery History"
          description="Every email delivery attempt for this invoice."
          flush
        >
          {emailLogs.length === 0 ? (
            <EmptyState
              title="No emails sent yet"
              text="Click 'Send Email' above to email this PDF invoice to the retailer."
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Provider ID / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.map((log) => (
                    <tr key={log.id}>
                      <td className={styles.nowrap}>{formatDateTime(log.createdAt)}</td>
                      <td>{log.recipientEmail}</td>
                      <td>{log.subject}</td>
                      <td>
                        <Badge tone={log.status === "sent" ? "approved" : "cancelled"}>
                          {log.status}
                        </Badge>
                      </td>
                      <td>
                        {log.providerMessageId ? (
                          <span className={styles.mono}>{log.providerMessageId}</span>
                        ) : log.error ? (
                          <span className={styles.warnText}>{log.error}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
