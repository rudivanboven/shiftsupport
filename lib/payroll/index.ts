import "server-only";

import {
  createAdpPayrollProvider,
  inspectAdpConfiguration,
  prepareAdpPayrollBatch,
  type AdpConnectionStatus,
  type AdpPreparedBatch,
} from "./adp";

/**
 * Payroll integration boundary.
 *
 * ShiftSupport does not pay workers directly: ADP runs worker payroll, taxes
 * and payment. This app's job is to hand ADP the APPROVED actual hours worked
 * for each worker. No bank details or tax details live here.
 *
 * When the client's ADP credentials, mTLS certificate/key, and endpoints are
 * configured on the server, `getPayrollProvider()` returns the live ADP
 * adapter. Until those credentials are provided, `inspectAdpConfiguration()`
 * reports the exact missing requirements and operators can continue to export
 * approved hours via `payrollCsv` without any fake API status.
 */

export {
  createAdpPayrollProvider,
  inspectAdpConfiguration,
  prepareAdpPayrollBatch,
  type AdpConnectionStatus,
  type AdpPreparedBatch,
};

export interface PayrollLine {
  shiftId: string;
  workerId: string;
  workerName: string | null;
  workerEmail: string | null;
  /** The worker's employee id in the payroll system, when it has been mapped. */
  externalEmployeeId: string | null;
  storeName: string | null;
  shiftDate: string;
  actualStart: string | null;
  actualEnd: string | null;
  breakMinutes: number;
  approvedHours: number;
  hourlyRate: number;
  grossAmount: number;
  approvedAt: string | null;
}

export type PayrollSubmitResult =
  | { ok: true; externalRef: string | null }
  | { ok: false; error: string };

export interface PayrollProvider {
  id: string;
  label: string;
  /** True only when every credential and mapping the adapter needs is present. */
  isConfigured(): boolean;
  submit(lines: PayrollLine[], batchId: string): Promise<PayrollSubmitResult>;
}

const PROVIDERS: Record<string, () => PayrollProvider> = {
  adp: () => createAdpPayrollProvider(),
};

export function getPayrollProvider(): PayrollProvider | null {
  const id = (
    process.env.PAYROLL_PROVIDER ??
    (process.env.ADP_CLIENT_ID ? "adp" : "")
  )
    .trim()
    .toLowerCase();
  if (!id || id === "manual_csv") return null;
  const factory = PROVIDERS[id];
  if (!factory) {
    console.error(`[payroll] PAYROLL_PROVIDER "${id}" has no registered adapter.`);
    return null;
  }
  const provider = factory();
  return provider.isConfigured() ? provider : null;
}

const CSV_HEADER = [
  "employee_id",
  "worker_name",
  "worker_email",
  "store",
  "shift_date",
  "actual_start",
  "actual_end",
  "break_minutes",
  "approved_hours",
  "gross_hourly_rate",
  "gross_amount",
  "approved_at",
  "shiftsupport_shift_id",
  "shiftsupport_worker_id",
];

/** Neutralises spreadsheet formula injection and CSV quoting. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function payrollCsv(lines: PayrollLine[]): string {
  const rows = lines.map((line) =>
    [
      line.externalEmployeeId,
      line.workerName,
      line.workerEmail,
      line.storeName,
      line.shiftDate,
      line.actualStart,
      line.actualEnd,
      line.breakMinutes,
      line.approvedHours.toFixed(2),
      line.hourlyRate.toFixed(2),
      line.grossAmount.toFixed(2),
      line.approvedAt,
      line.shiftId,
      line.workerId,
    ]
      .map(cell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
