import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { GenerateOrManageInvoiceActions } from "@/components/super-admin/InvoiceActions";
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
import { requireSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, retailerContact, workerContact } from "@/lib/admin/snapshot";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { validateShiftForInvoice } from "@/lib/invoices/core";
import { loadAllInvoicesSafe } from "@/lib/invoices/server";
import { RETAILER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = {
  title: "Retailer Invoices | Operations Control Center",
};

const PATH = "/super-admin/invoices";

const INVOICE_STATUS_BADGE: Record<
  string,
  {
    label: string;
    tone: "approved" | "open" | "pending" | "cancelled" | "neutral";
    pillClass: string;
  }
> = {
  generated: {
    label: "GENERATED",
    tone: "open",
    pillClass: styles.invoiceStatusGenerated,
  },
  sent: {
    label: "SENT",
    tone: "approved",
    pillClass: styles.invoiceStatusSent,
  },
  paid: {
    label: "PAID",
    tone: "approved",
    pillClass: styles.invoiceStatusPaid,
  },
  void: {
    label: "VOID",
    tone: "cancelled",
    pillClass: styles.invoiceStatusVoid,
  },
};

const EMAIL_STATUS_BADGE: Record<
  string,
  { label: string; tone: "approved" | "pending" | "cancelled" | "neutral" }
> = {
  not_sent: { label: "Pending Email", tone: "pending" },
  sent: { label: "Email Sent", tone: "approved" },
  failed: { label: "Email Failed", tone: "cancelled" },
};

const IconInvoiceCount = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5.5 2.8h6.3l3.7 3.7v10.3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z" />
    <path d="M11.6 2.9v3.8h3.8M7.3 10.2h5.4M7.3 13.2h3.8" />
  </svg>
);

const IconTotalAmount = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 2.6v14.8" />
    <path d="M13.2 6.1c0-1.3-1.4-2.2-3.2-2.2s-3.2.9-3.2 2.2c0 2.6 6.4 1.6 6.4 4.4 0 1.4-1.4 2.4-3.2 2.4s-3.2-1-3.2-2.4" />
  </svg>
);

const IconEmailSent = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.2" width="15" height="11.6" rx="2" />
    <path d="m3.3 5.2 6.7 5.1 6.7-5.1" />
  </svg>
);

const IconPendingEmail = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="7.4" />
    <path d="M10 6v4.3l2.8 1.7" />
  </svg>
);

export default async function SuperAdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    status?: string;
    store?: string;
    page?: string;
  }>;
}) {
  await requireSuperAdmin();

  const params = await searchParams;
  const tab = params.tab === "completed-shifts" ? "completed-shifts" : "invoices";
  const q = searchText(params.q);

  const [snapshot, { invoices, byShiftId, tableMissing }] = await Promise.all([
    loadSnapshot(),
    loadAllInvoicesSafe(),
  ]);

  const completedShifts = snapshot.shifts
    .filter((shift) => shift.status === "completed")
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .map((shift) => {
      const store = snapshot.storeById.get(shift.store_id) ?? null;
      const contact = retailerContact(snapshot, shift.store_id);
      const entry = snapshot.entryByShift.get(shift.id);
      const worker = shift.accepted_by
        ? snapshot.workerById.get(shift.accepted_by)
        : entry
          ? snapshot.workerById.get(entry.worker_id)
          : undefined;
      const wContact = worker ? workerContact(snapshot, worker) : null;

      const validation = validateShiftForInvoice({
        shift: {
          id: shift.id,
          storeId: shift.store_id,
          taskType: shift.task_type,
          shiftLocation: shift.shift_location,
          startTime: shift.start_time,
          endTime: shift.end_time,
          scheduledDuration: shift.duration,
          hourlyRate: shift.hourly_rate,
          status: shift.status,
          acceptedBy: shift.accepted_by,
          completedAt: shift.completed_at,
        },
        store: store
          ? {
               id: store.id,
              name: store.name,
              address: store.address,
              contactPhone: store.contact_phone,
            }
          : null,
        retailerContact: {
          userId: contact.owner?.auth_user_id ?? null,
          name: contact.name,
          email: contact.email,
          phone: contact.phone ?? store?.contact_phone ?? null,
        },
        workers:
          entry || worker
            ? [
                {
                  workerId: entry?.worker_id ?? worker?.id ?? "",
                  workerName: wContact?.name ?? worker?.full_name ?? null,
                  timeEntryId: entry?.id ?? null,
                  approvalStatus: entry?.approval_status ?? null,
                  approvedHours: entry?.approved_hours ?? null,
                  reportedHours: entry?.reported_hours ?? null,
                },
              ]
            : [],
      });

      const existingInvoice = byShiftId.get(shift.id) ?? null;

      return {
        shift,
        store,
        contact,
        entry,
        worker,
        workerName: wContact?.name ?? worker?.full_name ?? null,
        validation,
        existingInvoice,
      };
    });

  const filteredInvoices = invoices.filter((inv) => {
    if (
      !matchesSearch(
        q,
        inv.invoiceNumber,
        inv.retailerName,
        inv.storeName,
        inv.storeAddress,
        inv.contactPersonName,
        inv.contactEmail,
        inv.shiftTaskType,
      )
    ) {
      return false;
    }
    if (params.status && params.status !== "any" && inv.invoiceStatus !== params.status) {
      return false;
    }
    if (params.store && inv.storeId !== params.store) {
      return false;
    }
    return true;
  });

  const filteredCompletedShifts = completedShifts.filter((row) => {
    if (
      !matchesSearch(
        q,
        row.shift.task_type,
        row.store?.name,
        row.contact.name,
        row.contact.email,
        row.workerName,
        row.existingInvoice?.invoiceNumber,
      )
    ) {
      return false;
    }
    if (params.store && row.shift.store_id !== params.store) {
      return false;
    }
    return true;
  });

  // Real database summary metrics
  const totalGeneratedInvoices = invoices.length;
  const totalBilledCents = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const totalEmailsSentCount = invoices.filter((inv) => inv.emailStatus === "sent").length;
  const pendingEmailsCount = invoices.filter((inv) => inv.emailStatus !== "sent").length;
  const readyToGenerateCount = completedShifts.filter(
    (row) => row.validation.eligible && !row.existingInvoice,
  ).length;

  const storeOptions = [
    { value: "", label: "All stores" },
    ...snapshot.stores
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((store) => ({ value: store.id, label: store.name })),
  ];

  const activeList = tab === "completed-shifts" ? filteredCompletedShifts : filteredInvoices;
  const { page, pageCount, rows } = paginate(activeList as unknown[], params.page, PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Retailer Invoices"
        description="Generate, preview, download and email PDF invoices for completed shifts based on actual approved hours worked."
      />

      {tableMissing ? (
        <Notice>
          <p>
            The <code>retailer_invoices</code> table is not in the database yet. Apply{" "}
            <code>supabase/migrations/0018_remove_stripe_checkout_and_retailer_invoices.sql</code>{" "}
            in the Supabase SQL Editor to persist generated invoices.
          </p>
        </Notice>
      ) : null}

      <Metrics tone="finance">
        <Metric
          label="Total Generated Invoices"
          value={totalGeneratedInvoices}
          icon={<IconInvoiceCount />}
          hint={
            readyToGenerateCount > 0
              ? `${readyToGenerateCount} completed shift${readyToGenerateCount === 1 ? "" : "s"} ready to invoice`
              : `${completedShifts.length} completed shift${completedShifts.length === 1 ? "" : "s"} tracked`
          }
        />
        <Metric
          label="Total Invoiced Amount"
          value={money(totalBilledCents)}
          icon={<IconTotalAmount />}
          hint="Approved hours × retailer billing rate"
        />
        <Metric
          label="Total Emails Sent"
          value={totalEmailsSentCount}
          icon={<IconEmailSent />}
          hint="Delivered to retailer billing contacts"
        />
        <Metric
          label="Pending Emails"
          value={pendingEmailsCount}
          icon={<IconPendingEmail />}
          hint={
            pendingEmailsCount === 0
              ? "All generated invoices have been emailed"
              : "Generated invoices awaiting email dispatch"
          }
        />
      </Metrics>

      <div className={`${styles.presets} ${styles.tabRow}`}>
        {[
          { key: "invoices", label: `Generated Invoices (${invoices.length})` },
          {
            key: "completed-shifts",
            label: `Completed Shifts (${completedShifts.length})`,
          },
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
        <SearchFilter
          value={params.q}
          placeholder={
            tab === "invoices"
              ? "Invoice #, retailer, store, address or task"
              : "Store, worker or shift task"
          }
        />
        {tab === "invoices" ? (
          <SelectFilter
            name="status"
            label="Invoice status"
            value={params.status}
            options={[
              { value: "", label: "Any" },
              { value: "generated", label: "GENERATED" },
              { value: "sent", label: "SENT" },
              { value: "paid", label: "PAID" },
              { value: "void", label: "VOID" },
            ]}
          />
        ) : null}
        <SelectFilter name="store" label="Store" value={params.store} options={storeOptions} />
      </FilterBar>

      {tab === "invoices" ? (
        <Panel
          title="Generated invoices"
          description="One unique invoice per completed shift. Each invoice displays its full retailer and shift financial summary above a dedicated action bar."
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No invoices found"
              text={
                invoices.length === 0
                  ? "Switch to the Completed Shifts tab above to generate your first retailer invoice."
                  : "No invoices match the current filter."
              }
            />
          ) : (
            <>
              <div className={styles.invoiceCardList}>
                {(rows as typeof filteredInvoices).map((inv) => {
                  const invBadge = INVOICE_STATUS_BADGE[inv.invoiceStatus] ?? {
                    label: inv.invoiceStatus.toUpperCase(),
                    tone: "neutral" as const,
                    pillClass: styles.invoiceStatusGenerated,
                  };
                  const emailBadge = EMAIL_STATUS_BADGE[inv.emailStatus] ?? {
                    label: inv.emailStatus,
                    tone: "neutral" as const,
                  };

                  return (
                    <article key={inv.id} className={styles.invoiceCard}>
                      {/* Top Header: Invoice Number, Shift Task, and Status Badges */}
                      <div className={styles.invoiceCardHeader}>
                        <div className={styles.invoiceCardTitleGroup}>
                          <Link
                            className={styles.invoiceNumberLink}
                            href={`/super-admin/invoices/${inv.id}`}
                          >
                            Invoice #{inv.invoiceNumber}
                          </Link>
                          <span className={styles.invoiceTaskTag}>
                            {inv.shiftTaskType}
                          </span>
                        </div>

                        <div className={styles.invoiceCardBadges}>
                          <span className={`${styles.invoiceStatusPill} ${invBadge.pillClass}`}>
                            <span className={styles.invoiceStatusDot} aria-hidden="true" />
                            {invBadge.label}
                          </span>
                          <Badge tone={emailBadge.tone}>{emailBadge.label}</Badge>
                        </div>
                      </div>

                      {/* Middle Section: Wide, Readable Invoice Data Table (No Far-Right Actions Column) */}
                      <div className={styles.invoiceTableWrap}>
                        <table className={styles.invoiceDataTable}>
                          <thead>
                            <tr>
                              <th className={styles.invoiceColRetailer}>Retailer Name</th>
                              <th className={styles.invoiceColStore}>Store Name &amp; Address</th>
                              <th className={styles.invoiceColShiftDate}>Shift Date</th>
                              <th className={`${styles.invoiceColHours} ${styles.num}`}>
                                Hours &amp; Rate
                              </th>
                              <th className={`${styles.invoiceColAmount} ${styles.num}`}>
                                Invoice Amount
                              </th>
                              <th className={styles.invoiceColCreated}>
                                Created &amp; Email Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td data-label="Retailer Name" className={styles.invoiceColRetailer}>
                                <span className={styles.invoiceCellTitle}>
                                  {inv.contactPersonName ?? inv.retailerName}
                                </span>
                                <span className={styles.invoiceCellMeta}>
                                  {inv.contactEmail ?? "No email on file"}
                                </span>
                                {inv.contactPhone ? (
                                  <span className={styles.invoiceCellMeta}>
                                    {inv.contactPhone}
                                  </span>
                                ) : null}
                              </td>

                              <td
                                data-label="Store Name & Address"
                                className={styles.invoiceColStore}
                              >
                                <Link
                                  className={styles.invoiceCellTitle}
                                  href={`/super-admin/retailers/${inv.storeId}`}
                                >
                                  {inv.storeName}
                                </Link>
                                <span className={styles.invoiceCellMeta}>
                                  {inv.storeAddress ?? inv.shiftLocation ?? "Address not provided"}
                                </span>
                              </td>

                              <td data-label="Shift Date" className={styles.invoiceColShiftDate}>
                                <span className={styles.invoiceCellTitle}>
                                  {formatDate(inv.shiftDate)}
                                </span>
                                <span className={styles.invoiceCellMeta}>
                                  <Link href={`/super-admin/shifts/${inv.shiftId}`}>
                                    View shift details →
                                  </Link>
                                </span>
                              </td>

                              <td
                                data-label="Hours & Rate"
                                className={`${styles.invoiceColHours} ${styles.num}`}
                              >
                                <span className={styles.invoiceCellTitle}>
                                  {hoursText(inv.approvedHours)}
                                </span>
                                <span className={styles.invoiceCellMeta}>
                                  ${Number(inv.hourlyRate).toFixed(2)}/hr
                                </span>
                              </td>

                              <td
                                data-label="Invoice Amount"
                                className={`${styles.invoiceColAmount} ${styles.num}`}
                              >
                                <span className={styles.invoiceAmountValue}>
                                  {money(inv.totalCents)}
                                </span>
                                <span className={styles.invoiceCellMeta}>
                                  {inv.currency} · Approved hours
                                </span>
                              </td>

                              <td
                                data-label="Created & Email Status"
                                className={styles.invoiceColCreated}
                              >
                                <span className={styles.invoiceCellTitle}>
                                  {formatDateTime(inv.createdAt)}
                                </span>
                                <span className={styles.invoiceCellMeta}>
                                  {inv.emailSentAt
                                    ? `Sent ${formatDateTime(inv.emailSentAt)}${
                                        inv.emailSendCount > 1
                                          ? ` (${inv.emailSendCount}×)`
                                          : ""
                                      }`
                                    : "Email not sent yet"}
                                </span>
                                {inv.emailLastError ? (
                                  <span
                                    className={`${styles.invoiceCellMeta} ${styles.warnText}`}
                                  >
                                    {inv.emailLastError}
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Bottom Full-Width Action Panel Directly Below Invoice Information Row */}
                      <div className={styles.invoiceActionFooter}>
                        <GenerateOrManageInvoiceActions
                          shiftId={inv.shiftId}
                          eligible
                          showRecipientMeta
                          existingInvoice={{
                            id: inv.id,
                            invoiceNumber: inv.invoiceNumber,
                            invoiceStatus: inv.invoiceStatus,
                            emailStatus: inv.emailStatus,
                            emailSentAt: inv.emailSentAt,
                            emailSendCount: inv.emailSendCount,
                            contactEmail: inv.contactEmail,
                          }}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>

              <Pagination
                path={PATH}
                params={{ ...params, tab }}
                page={page}
                pageCount={pageCount}
                total={filteredInvoices.length}
              />
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title="Completed shifts"
          description="Select an eligible completed shift with approved actual hours to generate its PDF invoice."
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No completed shifts match"
              text="Once a store marks a shift as completed and its worked hours are approved, it appears here ready for invoicing."
            />
          ) : (
            <>
              <div className={styles.invoiceCardList}>
                {(rows as typeof filteredCompletedShifts).map(
                  ({
                    shift,
                    store,
                    contact,
                    entry,
                    worker,
                    workerName,
                    validation,
                    existingInvoice,
                  }) => {
                    const rate = shift.hourly_rate ?? RETAILER_HOURLY_RATE;
                    const approvedHours =
                      entry?.approval_status === "approved"
                        ? entry.approved_hours
                        : null;
                    const calculatedCents =
                      approvedHours && approvedHours > 0
                        ? Math.round(approvedHours * rate * 100)
                        : null;

                    return (
                      <article key={shift.id} className={styles.invoiceCard}>
                        <div className={styles.invoiceCardHeader}>
                          <div className={styles.invoiceCardTitleGroup}>
                            <Link
                              className={styles.invoiceNumberLink}
                              href={`/super-admin/shifts/${shift.id}`}
                            >
                              {shift.task_type}
                            </Link>
                            {existingInvoice ? (
                              <span className={styles.invoiceTaskTag}>
                                Invoice #{existingInvoice.invoiceNumber}
                              </span>
                            ) : null}
                          </div>

                          <div className={styles.invoiceCardBadges}>
                            {existingInvoice ? (
                              <>
                                <span
                                  className={`${styles.invoiceStatusPill} ${styles.invoiceStatusGenerated}`}
                                >
                                  <span
                                    className={styles.invoiceStatusDot}
                                    aria-hidden="true"
                                  />
                                  {existingInvoice.invoiceStatus.toUpperCase()}
                                </span>
                                <Badge
                                  tone={
                                    existingInvoice.emailStatus === "sent"
                                      ? "approved"
                                      : "pending"
                                  }
                                >
                                  {existingInvoice.emailStatus === "sent"
                                    ? "Email Sent"
                                    : "Pending Email"}
                                </Badge>
                              </>
                            ) : validation.eligible ? (
                              <Badge tone="open">Ready to Invoice</Badge>
                            ) : (
                              <Badge tone="pending">Awaiting Hours Approval</Badge>
                            )}
                          </div>
                        </div>

                        <div className={styles.invoiceTableWrap}>
                          <table className={styles.invoiceDataTable}>
                            <thead>
                              <tr>
                                <th className={styles.invoiceColRetailer}>
                                  Retailer Contact
                                </th>
                                <th className={styles.invoiceColStore}>
                                  Store &amp; Location
                                </th>
                                <th className={styles.invoiceColShiftDate}>Worker</th>
                                <th className={styles.invoiceColShiftDate}>
                                  Shift Date
                                </th>
                                <th
                                  className={`${styles.invoiceColHours} ${styles.num}`}
                                >
                                  Approved Hours
                                </th>
                                <th
                                  className={`${styles.invoiceColAmount} ${styles.num}`}
                                >
                                  Invoice Total
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  data-label="Retailer Contact"
                                  className={styles.invoiceColRetailer}
                                >
                                  <span className={styles.invoiceCellTitle}>
                                    {contact.name ?? store?.name ?? "Retailer"}
                                  </span>
                                  <span className={styles.invoiceCellMeta}>
                                    {contact.email ?? "No email"}
                                  </span>
                                </td>

                                <td
                                  data-label="Store & Location"
                                  className={styles.invoiceColStore}
                                >
                                  {store ? (
                                    <Link
                                      className={styles.invoiceCellTitle}
                                      href={`/super-admin/retailers/${store.id}`}
                                    >
                                      {store.name}
                                    </Link>
                                  ) : (
                                    <span className={styles.invoiceCellTitle}>—</span>
                                  )}
                                  <span className={styles.invoiceCellMeta}>
                                    {shift.shift_location ?? store?.address ?? "—"}
                                  </span>
                                </td>

                                <td
                                  data-label="Worker"
                                  className={styles.invoiceColShiftDate}
                                >
                                  {worker ? (
                                    <Link
                                      className={styles.invoiceCellTitle}
                                      href={`/super-admin/workers/${worker.id}`}
                                    >
                                      {workerName ?? "Worker"}
                                    </Link>
                                  ) : (
                                    <span className={styles.invoiceCellTitle}>—</span>
                                  )}
                                </td>

                                <td
                                  data-label="Shift Date"
                                  className={styles.invoiceColShiftDate}
                                >
                                  <span className={styles.invoiceCellTitle}>
                                    {formatDate(shift.start_time)}
                                  </span>
                                  <span className={styles.invoiceCellMeta}>
                                    {formatTime(shift.start_time)}–
                                    {formatTime(shift.end_time)}
                                  </span>
                                </td>

                                <td
                                  data-label="Approved Hours"
                                  className={`${styles.invoiceColHours} ${styles.num}`}
                                >
                                  <span className={styles.invoiceCellTitle}>
                                    {hoursText(approvedHours)}
                                  </span>
                                  <span className={styles.invoiceCellMeta}>
                                    ${rate}/hr (sched {hoursText(shift.duration)})
                                  </span>
                                </td>

                                <td
                                  data-label="Invoice Total"
                                  className={`${styles.invoiceColAmount} ${styles.num}`}
                                >
                                  <span className={styles.invoiceAmountValue}>
                                    {existingInvoice
                                      ? money(existingInvoice.totalCents)
                                      : calculatedCents !== null
                                        ? money(calculatedCents)
                                        : "—"}
                                  </span>
                                  <span className={styles.invoiceCellMeta}>USD</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className={styles.invoiceActionFooter}>
                          <GenerateOrManageInvoiceActions
                            shiftId={shift.id}
                            eligible={validation.eligible}
                            showRecipientMeta={Boolean(existingInvoice)}
                            ineligibleReason={
                              validation.eligible ? undefined : validation.reason
                            }
                            existingInvoice={
                              existingInvoice
                                ? {
                                    id: existingInvoice.id,
                                    invoiceNumber: existingInvoice.invoiceNumber,
                                    invoiceStatus: existingInvoice.invoiceStatus,
                                    emailStatus: existingInvoice.emailStatus,
                                    emailSentAt: existingInvoice.emailSentAt,
                                    emailSendCount: existingInvoice.emailSendCount,
                                    contactEmail: existingInvoice.contactEmail,
                                  }
                                : null
                            }
                          />
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
              <Pagination
                path={PATH}
                params={{ ...params, tab }}
                page={page}
                pageCount={pageCount}
                total={filteredCompletedShifts.length}
              />
            </>
          )}
        </Panel>
      )}
    </>
  );
}
