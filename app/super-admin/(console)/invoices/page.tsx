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
  { label: string; tone: "approved" | "open" | "pending" | "cancelled" | "neutral" }
> = {
  generated: { label: "GENERATED", tone: "open" },
  sent: { label: "SENT", tone: "approved" },
  paid: { label: "PAID", tone: "approved" },
  void: { label: "VOID", tone: "cancelled" },
};

const EMAIL_STATUS_BADGE: Record<
  string,
  { label: string; tone: "approved" | "pending" | "cancelled" | "neutral" }
> = {
  not_sent: { label: "Not sent", tone: "neutral" },
  sent: { label: "Email sent", tone: "approved" },
  failed: { label: "Failed", tone: "cancelled" },
};

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

  const totalBilledCents = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const emailedCount = invoices.filter((inv) => inv.emailStatus === "sent").length;
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
        <Metric label="Invoices generated" value={invoices.length} />
        <Metric
          label="Total invoiced amount"
          value={money(totalBilledCents)}
          hint="Approved hours × retailer billing rate"
        />
        <Metric label="Invoices emailed" value={emailedCount} />
        <Metric
          label="Eligible shifts awaiting invoice"
          value={readyToGenerateCount}
          hint={`${completedShifts.length} completed shifts total`}
        />
      </Metrics>

      <div className={`${styles.presets} ${styles.tabRow}`}>
        {[
          { key: "invoices", label: `Invoices (${invoices.length})` },
          {
            key: "completed-shifts",
            label: `Completed shifts (${completedShifts.length})`,
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
              ? "Invoice #, retailer, store or task"
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
              { value: "generated", label: "Generated" },
              { value: "sent", label: "Sent" },
              { value: "paid", label: "Paid" },
            ]}
          />
        ) : null}
        <SelectFilter name="store" label="Store" value={params.store} options={storeOptions} />
      </FilterBar>

      {tab === "invoices" ? (
        <Panel
          title="Generated invoices"
          description="One unique invoice per completed shift. Resending an invoice emails the existing PDF without creating a duplicate invoice number."
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No invoices found"
              text={
                invoices.length === 0
                  ? "Switch to the Completed shifts tab above to generate your first retailer invoice."
                  : "No invoices match the current filter."
              }
            />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Invoice Number</th>
                      <th>Retailer Name</th>
                      <th>Store Name</th>
                      <th>Shift Date</th>
                      <th className={styles.num}>Hours &amp; Rate</th>
                      <th className={styles.num}>Invoice Amount</th>
                      <th>Invoice Status</th>
                      <th>Created Date</th>
                      <th>Email Sending Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as typeof filteredInvoices).map((inv) => {
                      const invBadge = INVOICE_STATUS_BADGE[inv.invoiceStatus] ?? {
                        label: inv.invoiceStatus,
                        tone: "neutral" as const,
                      };
                      const emailBadge = EMAIL_STATUS_BADGE[inv.emailStatus] ?? {
                        label: inv.emailStatus,
                        tone: "neutral" as const,
                      };

                      return (
                        <tr key={inv.id}>
                          <td className={styles.nowrap}>
                            <Link
                              className={styles.primaryCell}
                              href={`/super-admin/invoices/${inv.id}`}
                            >
                              #{inv.invoiceNumber}
                            </Link>
                            <span className={styles.sub}>{inv.shiftTaskType}</span>
                          </td>
                          <td>
                            {inv.contactPersonName ?? inv.retailerName}
                            <span className={styles.sub}>{inv.contactEmail ?? "No email"}</span>
                          </td>
                          <td>
                            <Link
                              className={styles.primaryCell}
                              href={`/super-admin/retailers/${inv.storeId}`}
                            >
                              {inv.storeName}
                            </Link>
                            {inv.storeAddress ? (
                              <span className={styles.sub}>{inv.storeAddress}</span>
                            ) : null}
                          </td>
                          <td className={styles.nowrap}>
                            {formatDate(inv.shiftDate)}
                            <span className={styles.sub}>
                              <Link href={`/super-admin/shifts/${inv.shiftId}`}>View shift</Link>
                            </span>
                          </td>
                          <td className={styles.num}>
                            {hoursText(inv.approvedHours)}
                            <span className={styles.sub}>${inv.hourlyRate}/hr</span>
                          </td>
                          <td className={styles.num}>
                            <strong>{money(inv.totalCents)}</strong>
                            <span className={styles.sub}>{inv.currency}</span>
                          </td>
                          <td>
                            <Badge tone={invBadge.tone}>{invBadge.label}</Badge>
                          </td>
                          <td className={styles.nowrap}>{formatDateTime(inv.createdAt)}</td>
                          <td>
                            <Badge tone={emailBadge.tone}>{emailBadge.label}</Badge>
                            {inv.emailSentAt ? (
                              <span className={styles.sub}>
                                {formatDateTime(inv.emailSentAt)}
                                {inv.emailSendCount > 1 ? ` (${inv.emailSendCount}×)` : ""}
                              </span>
                            ) : null}
                            {inv.emailLastError ? (
                              <span className={`${styles.sub} ${styles.warnText}`}>
                                {inv.emailLastError}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <GenerateOrManageInvoiceActions
                              shiftId={inv.shiftId}
                              eligible
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
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Retailer / Store</th>
                      <th>Worker</th>
                      <th>Shift Date</th>
                      <th className={styles.num}>Approved Hours</th>
                      <th className={styles.num}>Rate</th>
                      <th className={styles.num}>Invoice Total</th>
                      <th>Invoice Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
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
                          <tr key={shift.id}>
                            <td>
                              <Link
                                className={styles.primaryCell}
                                href={`/super-admin/shifts/${shift.id}`}
                              >
                                {shift.task_type}
                              </Link>
                              <span className={styles.sub}>
                                {shift.shift_location ?? store?.address ?? "—"}
                              </span>
                            </td>
                            <td>
                              {store ? (
                                <Link
                                  className={styles.primaryCell}
                                  href={`/super-admin/retailers/${store.id}`}
                                >
                                  {store.name}
                                </Link>
                              ) : (
                                "—"
                              )}
                              <span className={styles.sub}>
                                {contact.name ?? contact.email ?? "No contact"}
                              </span>
                            </td>
                            <td>
                              {worker ? (
                                <Link
                                  className={styles.primaryCell}
                                  href={`/super-admin/workers/${worker.id}`}
                                >
                                  {workerName ?? "Worker"}
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
                              {hoursText(approvedHours)}
                              <span className={styles.sub}>
                                sched {hoursText(shift.duration)}
                              </span>
                            </td>
                            <td className={styles.num}>${rate}/hr</td>
                            <td className={styles.num}>
                              {existingInvoice
                                ? money(existingInvoice.totalCents)
                                : calculatedCents !== null
                                  ? money(calculatedCents)
                                  : "—"}
                            </td>
                            <td>
                              {existingInvoice ? (
                                <>
                                  <Badge tone="approved">
                                    #{existingInvoice.invoiceNumber}
                                  </Badge>
                                  <span className={styles.sub}>
                                    {existingInvoice.emailStatus === "sent"
                                      ? "Emailed to retailer"
                                      : "Generated"}
                                  </span>
                                </>
                              ) : validation.eligible ? (
                                <Badge tone="open">Ready to invoice</Badge>
                              ) : (
                                <>
                                  <Badge tone="pending">Awaiting hours approval</Badge>
                                  <span className={styles.sub}>
                                    <Link href={`/super-admin/shifts/${shift.id}`}>
                                      Record / approve hours →
                                    </Link>
                                  </span>
                                </>
                              )}
                            </td>
                            <td>
                              <GenerateOrManageInvoiceActions
                                shiftId={shift.id}
                                eligible={validation.eligible}
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
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
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
