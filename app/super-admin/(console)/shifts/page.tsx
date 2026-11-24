import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { GenerateOrManageInvoiceActions } from "@/components/super-admin/InvoiceActions";
import { ShiftManagementActions } from "@/components/super-admin/ShiftManagementActions";
import {
  FilterBar,
  Metric,
  Metrics,
  Pagination,
  RangeFilter,
  SearchFilter,
  SelectFilter,
  hours as hoursText,
  hrefWith,
  matchesSearch,
  money,
  paginate,
  searchText,
  sortRows,
} from "@/components/super-admin/ui";
import { PAGE_SIZE } from "@/lib/admin/config";
import { parseRange, wallClockInRange, wallClockNow } from "@/lib/admin/dates";
import { PAYMENT_STATUS, SHIFT_STATUS, STAGE_LABELS, STAGE_TONES } from "@/lib/admin/labels";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { isOpenShift, loadSnapshot, payrollStage, retailerContact, workerContact } from "@/lib/admin/snapshot";
import { loadSeriesIndex } from "@/lib/admin/series";
import { loadAllInvoicesSafe } from "@/lib/invoices/server";
import { describeDays } from "@/lib/recurrence";
import { formatDate, formatTime } from "@/lib/format";
import { RETAILER_HOURLY_RATE } from "@/lib/pricing";
import styles from "@/components/super-admin/Admin.module.css";

export const metadata: Metadata = { title: "Shifts | Operations Control Center" };

const PATH = "/super-admin/shifts";

type StatusFilter = "any" | "draft" | "open" | "hired" | "completed" | "cancelled";

function invoiceStatusTone(status: string): string {
  switch (status) {
    case "paid":
      return styles.invoiceStatusPaid;
    case "sent":
      return styles.invoiceStatusSent;
    case "void":
      return styles.invoiceStatusVoid;
    default:
      return styles.invoiceStatusGenerated;
  }
}

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
  const [snapshot, seriesIndex, { byShiftId: invoiceByShiftId }] = await Promise.all([
    loadSnapshot(),
    loadSeriesIndex(),
    loadAllInvoicesSafe(),
  ]);

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

  const storeList = snapshot.stores
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((store) => ({ value: store.id, label: store.name }));

  const storeOptions = [
    { value: "", label: "All stores" },
    ...storeList,
  ];

  const nowWallClock = wallClockNow();

  const activeSort = params.sort ?? "date";
  const sortOptions = [
    { key: "date", label: "Date & time" },
    { key: "store", label: "Retailer / store" },
    { key: "amount", label: "Retailer paid" },
    { key: "applicants", label: "Applications" },
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
            <div className={styles.shiftToolbar}>
              <div className={styles.shiftToolbarCount}>
                Showing <strong>{rows.length}</strong> of <strong>{sorted.length}</strong> matching shifts
              </div>
              <div className={styles.shiftSortGroup} role="group" aria-label="Sort shifts">
                <span className={styles.shiftSortLabel}>Sort by</span>
                {sortOptions.map((option) => {
                  const isActive = activeSort === option.key;
                  const nextDir = isActive && params.dir !== "asc" ? "asc" : "desc";
                  return (
                    <Link
                      key={option.key}
                      href={hrefWith(PATH, params, { sort: option.key, dir: nextDir, page: undefined })}
                      className={`${styles.shiftSortPill} ${isActive ? styles.shiftSortPillActive : ""}`}
                    >
                      <span>{option.label}</span>
                      {isActive ? (
                        <span aria-hidden="true">{params.dir === "asc" ? "↑" : "↓"}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className={styles.invoiceCardList}>
              {rows.map((shift) => {
                const store = snapshot.storeById.get(shift.store_id);
                const contact = retailerContact(snapshot, shift.store_id);
                const worker = shift.accepted_by ? snapshot.workerById.get(shift.accepted_by) : undefined;
                const workerInfo = worker ? workerContact(snapshot, worker) : null;
                const entry = snapshot.entryByShift.get(shift.id);
                const stage = payrollStage(shift, entry);
                const statusInfo = SHIFT_STATUS[shift.status];
                const paymentInfo = PAYMENT_STATUS[shift.payment_status];
                const applicants = snapshot.applicationsByShift.get(shift.id) ?? [];
                const pendingApplicants = applicants.filter((a) => a.status === "pending").length;
                const series = seriesIndex.get(shift.id);
                const existingInvoice = invoiceByShiftId.get(shift.id) ?? null;
                const hourlyRate = shift.hourly_rate ?? RETAILER_HOURLY_RATE;
                const scheduledAmountCents = Math.round(shift.duration * hourlyRate * 100);
                const invoiceEligible =
                  shift.status === "completed" &&
                  entry?.approval_status === "approved" &&
                  Boolean(entry.approved_hours && entry.approved_hours > 0);

                const isExpired =
                  ((shift.posting_expires_at ?? shift.end_time).replace(" ", "T") <= nowWallClock ||
                    shift.end_time.replace(" ", "T") <= nowWallClock) &&
                  shift.status !== "completed" &&
                  shift.status !== "cancelled";
                const isHidden = Boolean(shift.is_hidden);
                const isRenewed = Number(shift.renewal_count ?? 0) > 0;
                const canRenew =
                  shift.status !== "completed" &&
                  !shift.completed_at &&
                  !shift.accepted_by &&
                  !entry &&
                  !existingInvoice &&
                  (isExpired || shift.status === "cancelled" || shift.status === "draft" || shift.status === "open");

                let deleteBlockedReason: string | undefined;
                if (shift.status === "completed" || shift.completed_at) {
                  deleteBlockedReason =
                    "Cannot delete this shift because it has completed work on record.";
                } else if (existingInvoice) {
                  deleteBlockedReason = `Cannot delete this shift because Invoice #${existingInvoice.invoiceNumber} has already been generated for it.`;
                } else if (entry) {
                  if (entry.approval_status === "approved" || entry.approved_hours !== null) {
                    deleteBlockedReason =
                      "Cannot delete this shift because worked hours have already been approved for payroll.";
                  } else if (
                    ["ready", "exported", "submitted", "processed"].includes(entry.payroll_status)
                  ) {
                    deleteBlockedReason =
                      "Cannot delete this shift because it has active payroll records.";
                  } else {
                    deleteBlockedReason =
                      "Cannot delete this shift because worked hours have been recorded in a timesheet.";
                  }
                } else if (
                  shift.payment_status === "paid" ||
                  snapshot.paymentByShift.get(shift.id)?.status === "paid"
                ) {
                  deleteBlockedReason =
                    "Cannot delete this shift because it has a confirmed payment record.";
                }
                const canDelete = shift.status !== "cancelled" && !deleteBlockedReason;

                const payrollLocked = Boolean(
                  entry && ["exported", "submitted", "processed"].includes(entry.payroll_status),
                );
                const canChangeStoreOrRate =
                  !existingInvoice && !payrollLocked && !series;
                const storeOrRateLockedReason = existingInvoice
                  ? `Invoice #${existingInvoice.invoiceNumber} exists for this shift, so store and hourly rate are locked.`
                  : payrollLocked
                    ? "Payroll processing has started for this shift, so store reassignment is locked."
                    : series
                      ? "This shift belongs to a recurring series, so its store is locked to the series store."
                      : undefined;

                return (
                  <article key={shift.id} className={styles.invoiceCard}>
                    {/* Card Header: Shift Title, Date/Time Tag, and Primary Status Badges */}
                    <div className={styles.invoiceCardHeader}>
                      <div className={styles.invoiceCardTitleGroup}>
                        <Link className={styles.invoiceNumberLink} href={`${PATH}/${shift.id}`}>
                          {shift.task_type}
                        </Link>
                        <span className={styles.invoiceTaskTag}>
                          {formatDate(shift.start_time)} · {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                        </span>
                        {series ? (
                          <span className={styles.invoiceTaskTag}>
                            Recurring · {describeDays(series.daysOfWeek)}
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.invoiceCardBadges}>
                        <Badge tone={statusInfo.tone}>{statusInfo.label.toUpperCase()}</Badge>
                        {isHidden ? <Badge tone="pending">HIDDEN</Badge> : null}
                        {isExpired ? <Badge tone="pending">EXPIRED</Badge> : null}
                        {isRenewed ? (
                          <Badge tone="open">RENEWED {shift.renewal_count}X</Badge>
                        ) : null}
                        <Badge tone={paymentInfo.tone}>{paymentInfo.label.toUpperCase()}</Badge>
                        <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage].toUpperCase()}</Badge>
                        {existingInvoice ? (
                          <span
                            className={`${styles.invoiceStatusPill} ${invoiceStatusTone(existingInvoice.invoiceStatus)}`}
                          >
                            <span className={styles.invoiceStatusDot} />
                            INVOICE {existingInvoice.invoiceStatus.toUpperCase()}
                          </span>
                        ) : invoiceEligible ? (
                          <Badge tone="open">READY TO INVOICE</Badge>
                        ) : null}
                      </div>
                    </div>

                    {/* Two-Column Card Body */}
                    <div className={styles.shiftCardBody}>
                      {/* Column 1: Shift Date/Time, Store/Retailer Info, Applications & Hired Worker */}
                      <div className={styles.shiftCardColumn}>
                        <div className={styles.shiftSectionGrid}>
                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Shift Date & Time</span>
                            <span className={styles.shiftInfoValue}>{formatDate(shift.start_time)}</span>
                            <span className={styles.shiftInfoMeta}>
                              {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                            </span>
                            <span className={styles.shiftInfoMeta}>
                              Posting expiry:{" "}
                              {shift.posting_expires_at
                                ? `${formatDate(shift.posting_expires_at)} · ${formatTime(shift.posting_expires_at)}`
                                : `${formatDate(shift.end_time)} (shift end)`}
                            </span>
                            {series ? (
                              <span className={styles.shiftInfoMeta}>
                                Recurring · {describeDays(series.daysOfWeek)}
                              </span>
                            ) : (
                              <span className={styles.shiftInfoMeta}>One-time shift</span>
                            )}
                          </div>

                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Store / Retailer</span>
                            {store ? (
                              <Link className={styles.shiftInfoValue} href={`/super-admin/retailers/${store.id}`}>
                                {store.name}
                              </Link>
                            ) : (
                              <span className={styles.shiftInfoValue}>—</span>
                            )}
                            <span className={styles.shiftInfoMeta}>
                              {shift.shift_location ?? store?.address ?? "No location"}
                            </span>
                            {contact.name || contact.email ? (
                              <span className={styles.shiftInfoMeta}>
                                {[contact.name, contact.email].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.shiftStatusRow}>
                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Applications</span>
                            <span className={styles.shiftInfoValue}>
                              {applicants.length} {applicants.length === 1 ? "applicant" : "applicants"}
                            </span>
                            <span className={styles.shiftInfoMeta}>
                              {pendingApplicants > 0
                                ? `${pendingApplicants} pending review`
                                : applicants.length > 0
                                  ? "All applications reviewed"
                                  : "No applications received yet"}
                            </span>
                          </div>

                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Hired Worker</span>
                            {worker && workerInfo ? (
                              <>
                                <Link className={styles.shiftInfoValue} href={`/super-admin/workers/${worker.id}`}>
                                  {workerInfo.name ?? "Worker"}
                                </Link>
                                <span className={styles.shiftInfoMeta}>
                                  {[workerInfo.email, workerInfo.phone].filter(Boolean).join(" · ") || "Assigned to shift"}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={styles.shiftInfoValue}>Not hired yet</span>
                                <span className={styles.shiftInfoMeta}>Awaiting worker assignment</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Hours & Rate, Shift/Payment Status, Payroll/ADP Status & Invoice Status */}
                      <div className={styles.shiftCardColumn}>
                        <div className={styles.shiftSectionGrid}>
                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Scheduled Hours & Rate</span>
                            <span className={styles.shiftInfoValue}>
                              {hoursText(shift.duration)} @ ${hourlyRate}/hr
                            </span>
                            <span className={styles.shiftInfoMeta}>
                              {entry?.approved_hours
                                ? `Approved: ${hoursText(entry.approved_hours)} (${money(Math.round(entry.approved_hours * hourlyRate * 100))})`
                                : entry?.reported_hours
                                  ? `Reported: ${hoursText(entry.reported_hours)} (pending approval)`
                                  : `Est. value: ${money(scheduledAmountCents)}`}
                            </span>
                          </div>

                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Payment & Shift Status</span>
                            <div className={styles.shiftInfoBadgeRow}>
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                              <Badge tone={paymentInfo.tone}>{paymentInfo.label}</Badge>
                            </div>
                            <span className={styles.shiftInfoMeta}>
                              {shift.amount_paid_cents
                                ? `Retailer paid: ${money(shift.amount_paid_cents)}`
                                : existingInvoice
                                  ? `Invoiced total: ${money(existingInvoice.totalCents)}`
                                  : "Direct post-shift invoice billing"}
                            </span>
                          </div>
                        </div>

                        <div className={styles.shiftStatusRow}>
                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Payroll / ADP Status</span>
                            <div className={styles.shiftInfoBadgeRow}>
                              <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
                            </div>
                            <span className={styles.shiftInfoMeta}>
                              {entry?.approved_hours
                                ? `${hoursText(entry.approved_hours)} approved for payroll`
                                : shift.status === "completed"
                                  ? "Record & approve hours to unlock payroll"
                                  : "Unlocks after shift completion"}
                            </span>
                          </div>

                          <div className={styles.shiftInfoItem}>
                            <span className={styles.shiftInfoLabel}>Invoice Status</span>
                            {existingInvoice ? (
                              <>
                                <Link
                                  className={styles.shiftInfoValue}
                                  href={`/super-admin/invoices/${existingInvoice.id}`}
                                >
                                  #{existingInvoice.invoiceNumber} · {money(existingInvoice.totalCents)}
                                </Link>
                                <span className={styles.shiftInfoMeta}>
                                  {existingInvoice.invoiceStatus.toUpperCase()} ·{" "}
                                  {existingInvoice.emailStatus === "sent"
                                    ? `Email sent (${existingInvoice.emailSendCount}x)`
                                    : "Email pending"}
                                </span>
                              </>
                            ) : invoiceEligible ? (
                              <>
                                <span className={styles.shiftInfoValue}>Ready to generate</span>
                                <span className={styles.shiftInfoMeta}>
                                  Approved hours ready for retailer invoicing
                                </span>
                              </>
                            ) : shift.status === "completed" ? (
                              <>
                                <span className={styles.shiftInfoValue}>Awaiting hours approval</span>
                                <span className={styles.shiftInfoMeta}>Approve worked hours first</span>
                              </>
                            ) : (
                              <>
                                <span className={styles.shiftInfoValue}>—</span>
                                <span className={styles.shiftInfoMeta}>Available once shift is completed</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full-Width Bottom Action Panel */}
                    <div className={styles.invoiceActionFooter}>
                      <div className={styles.shiftFooterLayout}>
                        <div className={styles.shiftFooterTopRow}>
                          <div className={styles.invoiceActionMeta}>
                            <span className={styles.invoiceActionMetaStrong}>{shift.task_type}</span>
                            <span>·</span>
                            <span>{store?.name ?? "Store"}</span>
                            <span>·</span>
                            <span>{formatDate(shift.start_time)}</span>
                          </div>

                          <div className={styles.shiftQuickActions}>
                            <Link
                              href={`${PATH}/${shift.id}`}
                              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
                            >
                              Manage Shift
                            </Link>
                            {store ? (
                              <Link
                                href={`/super-admin/retailers/${store.id}`}
                                className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
                              >
                                View Store
                              </Link>
                            ) : null}
                            {worker ? (
                              <Link
                                href={`/super-admin/workers/${worker.id}`}
                                className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
                              >
                                View Worker
                              </Link>
                            ) : null}
                          </div>
                        </div>

                        <ShiftManagementActions
                          shift={{
                            id: shift.id,
                            storeId: shift.store_id,
                            storeName: store?.name ?? "Unknown store",
                            taskType: shift.task_type,
                            description: shift.description,
                            shiftLocation: shift.shift_location ?? store?.address ?? "",
                            startTime: shift.start_time,
                            endTime: shift.end_time,
                            duration: shift.duration,
                            hourlyRate,
                            status: shift.status,
                            isHidden,
                            postingExpiresAt: shift.posting_expires_at ?? null,
                            renewedAt: shift.renewed_at ?? null,
                            renewalCount: Number(shift.renewal_count ?? 0),
                            isExpired,
                            hasHiredWorker: Boolean(shift.accepted_by),
                            isRecurring: Boolean(series),
                          }}
                          stores={storeList}
                          canRenew={canRenew}
                          renewDisabledReason={
                            shift.status === "completed" || shift.completed_at
                              ? "Completed shifts cannot be renewed."
                              : shift.accepted_by
                                ? "Worker already hired — use Edit Shift to adjust schedule."
                                : existingInvoice
                                  ? "Invoiced shifts cannot be renewed."
                                  : entry
                                    ? "Shifts with recorded hours cannot be renewed."
                                    : undefined
                          }
                          canDelete={canDelete}
                          deleteBlockedReason={deleteBlockedReason}
                          canChangeStoreOrRate={canChangeStoreOrRate}
                          storeOrRateLockedReason={storeOrRateLockedReason}
                        />

                        {shift.status === "completed" || existingInvoice ? (
                          <div className={styles.shiftFooterInvoiceWrap}>
                            <GenerateOrManageInvoiceActions
                              shiftId={shift.id}
                              eligible={invoiceEligible}
                              ineligibleReason="Approve hours first"
                              showRecipientMeta={Boolean(existingInvoice)}
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
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <Pagination path={PATH} params={params} page={page} pageCount={pageCount} total={sorted.length} />
          </>
        )}
      </Panel>
    </>
  );
}
