import { NextResponse, type NextRequest } from "next/server";

import { getSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, payrollStage, workerContact } from "@/lib/admin/snapshot";
import { payrollCsv, type PayrollLine } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";
import { WORKER_HOURLY_RATE } from "@/lib/pricing";

/**
 * POST /super-admin/payroll/export
 *
 * Builds the payroll CSV for every line whose hours are APPROVED and whose
 * payroll status is `ready`, marks those lines as exported (which also writes
 * the audit entry, inside `set_payroll_status`), and returns the file.
 *
 * POST, not GET, because it changes state — a prefetched link must not mark
 * payroll as exported. It is not an ADP integration: it is a file an operator
 * uploads or keys into ADP.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (request: NextRequest, query: string) =>
  NextResponse.redirect(new URL(`/super-admin/payroll?${query}`, request.nextUrl.origin), { status: 303 });

export async function POST(request: NextRequest) {
  const admin = await getSuperAdmin();
  if (!admin) return new NextResponse("Not found", { status: 404 });

  // Route handlers get no server-action origin check, so do it here.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const snapshot = await loadSnapshot();
  const payrollIds = new Map(snapshot.payrollIds.filter((p) => p.provider === "adp").map((p) => [p.worker_id, p.external_employee_id]));

  const lines: PayrollLine[] = [];
  for (const shift of snapshot.shifts) {
    const entry = snapshot.entryByShift.get(shift.id);
    if (!entry || payrollStage(shift, entry) !== "ready" || entry.approved_hours === null) continue;

    const worker = snapshot.workerById.get(entry.worker_id);
    const info = worker ? workerContact(snapshot, worker) : null;
    const rate = entry.worker_hourly_rate || WORKER_HOURLY_RATE;

    lines.push({
      shiftId: shift.id,
      workerId: entry.worker_id,
      workerName: info?.name ?? null,
      workerEmail: info?.email ?? null,
      externalEmployeeId: payrollIds.get(entry.worker_id) ?? null,
      storeName: snapshot.storeById.get(shift.store_id)?.name ?? null,
      shiftDate: shift.start_time.slice(0, 10),
      actualStart: entry.actual_start_time,
      actualEnd: entry.actual_end_time,
      breakMinutes: entry.break_minutes,
      approvedHours: entry.approved_hours,
      hourlyRate: rate,
      grossAmount: Math.round(entry.approved_hours * rate * 100) / 100,
      approvedAt: entry.approved_at,
    });
  }

  if (lines.length === 0) return back(request, "error=none");

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const batchId = `csv-${stamp}`;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_payroll_status", {
    p_shift_ids: lines.map((line) => line.shiftId),
    p_status: "exported",
    p_provider: "manual_csv",
    p_batch_id: batchId,
    p_external_ref: null,
    p_error: null,
  });

  if (error) {
    console.error("[super-admin] Payroll export could not be recorded:", error.message);
    return back(request, "error=1");
  }

  const updated = Number(data ?? 0);
  if (updated === 0) return back(request, "error=none");

  return new NextResponse(payrollCsv(lines), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shiftsupport-payroll-${batchId}.csv"`,
      "Cache-Control": "no-store",
      "X-Payroll-Batch": batchId,
    },
  });
}
