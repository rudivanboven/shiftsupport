import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb, assertSuperAdmin } from "@/lib/admin/auth";
import { loadSnapshot, retailerContact, workerContact } from "@/lib/admin/snapshot";
import { getEmailProvider } from "@/lib/email";
import { getSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  executeGenerateRetailerInvoice,
  executeSendRetailerInvoiceEmail,
  formatInvoiceNumber,
  generateInvoicePdfBuffer,
  INVOICE_STORAGE_BUCKET,
  type GenerateInvoiceOutcome,
  type InvoiceEmailLogEntry,
  type InvoiceLineItem,
  type InvoiceRepository,
  type InvoiceStatus,
  type InvoiceEmailStatus,
  type RetailerInvoiceRecord,
  type SendInvoiceEmailOutcome,
  type ShiftInvoiceCandidate,
} from "./core";

type AdminClient = ReturnType<typeof createAdminClient>;

const INVOICES_TABLE = "retailer_invoices";
const EMAIL_LOGS_TABLE = "retailer_invoice_email_logs";
const STORAGE_LEDGER_INDEX_PATH = "records/invoices-index.json";

function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
  tableName: string,
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return msg.includes(tableName) && /schema cache|does not exist|relation/i.test(msg);
}

interface StorageLedgerState {
  invoices: RetailerInvoiceRecord[];
  emailLogs: InvoiceEmailLogEntry[];
}

async function ensurePrivateInvoiceBucket(db: AdminClient): Promise<void> {
  try {
    const { data: buckets } = await db.storage.listBuckets();
    const exists = (buckets ?? []).some((b) => b.id === INVOICE_STORAGE_BUCKET);
    if (!exists) {
      await db.storage.createBucket(INVOICE_STORAGE_BUCKET, { public: false });
    }
  } catch {
    // Non-fatal if bucket already exists
  }
}

async function readStorageLedger(db: AdminClient): Promise<StorageLedgerState> {
  await ensurePrivateInvoiceBucket(db);
  try {
    const { data, error } = await db.storage
      .from(INVOICE_STORAGE_BUCKET)
      .download(STORAGE_LEDGER_INDEX_PATH);
    if (error || !data) {
      return { invoices: [], emailLogs: [] };
    }
    const text = await data.text();
    const parsed = JSON.parse(text) as Partial<StorageLedgerState>;
    return {
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      emailLogs: Array.isArray(parsed.emailLogs) ? parsed.emailLogs : [],
    };
  } catch {
    return { invoices: [], emailLogs: [] };
  }
}

async function writeStorageLedger(
  db: AdminClient,
  state: StorageLedgerState,
): Promise<void> {
  await ensurePrivateInvoiceBucket(db);
  const body = Buffer.from(JSON.stringify(state, null, 2), "utf8");
  const { error } = await db.storage
    .from(INVOICE_STORAGE_BUCKET)
    .upload(STORAGE_LEDGER_INDEX_PATH, body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    console.error("[invoices] Could not write storage ledger:", error.message);
  }
}

interface DbInvoiceRow {
  id: string;
  invoice_number: string;
  shift_id: string;
  store_id: string;
  retailer_user_id: string | null;
  worker_id: string | null;
  time_entry_id: string | null;
  retailer_name: string;
  store_name: string;
  store_address: string | null;
  contact_person_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  shift_task_type: string;
  shift_location: string | null;
  shift_date: string;
  shift_start_time: string;
  shift_end_time: string;
  approved_hours: number | string;
  hourly_rate: number | string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  line_items: InvoiceLineItem[] | null;
  pdf_storage_bucket: string;
  pdf_storage_path: string;
  pdf_size_bytes: number | null;
  pdf_sha256: string | null;
  invoice_status: InvoiceStatus;
  email_status: InvoiceEmailStatus;
  email_sent_at: string | null;
  email_send_count: number;
  last_emailed_to: string | null;
  email_provider: string | null;
  email_provider_message_id: string | null;
  email_last_error: string | null;
  created_by: string | null;
  issued_at: string;
  created_at: string;
  updated_at: string;
}

function mapRowToInvoice(row: DbInvoiceRow): RetailerInvoiceRecord {
  const approvedHours = Number(row.approved_hours) || 0;
  const hourlyRate = Number(row.hourly_rate) || 0;
  const lineItems = Array.isArray(row.line_items) ? row.line_items : [];

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    shiftId: row.shift_id,
    storeId: row.store_id,
    retailerUserId: row.retailer_user_id,
    workerId: row.worker_id,
    timeEntryId: row.time_entry_id,
    retailerName: row.retailer_name,
    storeName: row.store_name,
    storeAddress: row.store_address,
    contactPersonName: row.contact_person_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    shiftTaskType: row.shift_task_type,
    shiftLocation: row.shift_location,
    shiftDate: row.shift_date,
    shiftStartTime: row.shift_start_time,
    shiftEndTime: row.shift_end_time,
    approvedHours,
    hourlyRate,
    subtotalCents: Number(row.subtotal_cents) || 0,
    taxCents: Number(row.tax_cents) || 0,
    totalCents: Number(row.total_cents) || 0,
    currency: row.currency || "USD",
    lineItems,
    pdfStorageBucket: row.pdf_storage_bucket || INVOICE_STORAGE_BUCKET,
    pdfStoragePath: row.pdf_storage_path,
    pdfSizeBytes: Number(row.pdf_size_bytes) || 0,
    pdfSha256: row.pdf_sha256 ?? "",
    invoiceStatus: row.invoice_status,
    emailStatus: row.email_status,
    emailSentAt: row.email_sent_at,
    emailSendCount: Number(row.email_send_count) || 0,
    lastEmailedTo: row.last_emailed_to,
    emailProvider: row.email_provider,
    emailProviderMessageId: row.email_provider_message_id,
    emailLastError: row.email_last_error,
    createdBy: row.created_by,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mergeInvoices(
  sqlInvoices: RetailerInvoiceRecord[],
  storageInvoices: RetailerInvoiceRecord[],
): RetailerInvoiceRecord[] {
  const byShift = new Map<string, RetailerInvoiceRecord>();
  for (const inv of storageInvoices) {
    byShift.set(inv.shiftId, inv);
  }
  for (const inv of sqlInvoices) {
    byShift.set(inv.shiftId, inv);
  }
  return [...byShift.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function createSupabaseInvoiceRepository(
  customDb?: AdminClient,
): InvoiceRepository {
  const resolveDb = async () => customDb ?? (await adminDb());

  return {
    async getInvoiceByShiftId(shiftId: string) {
      const db = await resolveDb();
      const { data, error } = await db
        .from(INVOICES_TABLE)
        .select("*")
        .eq("shift_id", shiftId)
        .maybeSingle();

      if (!error && data) {
        return mapRowToInvoice(data as unknown as DbInvoiceRow);
      }

      const ledger = await readStorageLedger(db);
      return ledger.invoices.find((inv) => inv.shiftId === shiftId) ?? null;
    },

    async getInvoiceById(invoiceId: string) {
      const db = await resolveDb();
      const { data, error } = await db
        .from(INVOICES_TABLE)
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();

      if (!error && data) {
        return mapRowToInvoice(data as unknown as DbInvoiceRow);
      }

      const ledger = await readStorageLedger(db);
      return ledger.invoices.find((inv) => inv.id === invoiceId) ?? null;
    },

    async listInvoices() {
      const db = await resolveDb();
      const [sqlRes, ledger] = await Promise.all([
        db
          .from(INVOICES_TABLE)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        readStorageLedger(db),
      ]);

      const sqlInvoices =
        !sqlRes.error && sqlRes.data
          ? (sqlRes.data as unknown as DbInvoiceRow[]).map(mapRowToInvoice)
          : [];

      return mergeInvoices(sqlInvoices, ledger.invoices);
    },

    async getShiftCandidate(shiftId: string): Promise<ShiftInvoiceCandidate | null> {
      const db = await resolveDb();

      const { data: shift } = await db
        .from("shifts")
        .select(
          "id,store_id,task_type,description,shift_location,start_time,end_time,duration,hourly_rate,status,accepted_by,created_at,completed_at",
        )
        .eq("id", shiftId)
        .maybeSingle();

      if (!shift) return null;

      const [
        { data: store },
        { data: storeUsers },
        { data: entry },
      ] = await Promise.all([
        db
          .from("stores")
          .select("id,name,address,contact_phone")
          .eq("id", shift.store_id)
          .maybeSingle(),
        db
          .from("store_users")
          .select("id,store_id,auth_user_id,email,role,created_at")
          .eq("store_id", shift.store_id)
          .order("created_at", { ascending: true }),
        db
          .from("shift_time_entries")
          .select(
            "id,shift_id,worker_id,approval_status,approved_hours,reported_hours",
          )
          .eq("shift_id", shift.id)
          .maybeSingle(),
      ]);

      const owner = ((storeUsers ?? []) as {
        id: string;
        store_id: string;
        auth_user_id: string | null;
        email: string | null;
        role: string | null;
      }[]).sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0))[0];

      interface OwnerProfileRow {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }
      let ownerProfile: OwnerProfileRow | null = null;

      if (owner?.auth_user_id) {
        const { data: prof } = await db
          .from("profiles")
          .select("id,full_name,email,phone")
          .eq("id", owner.auth_user_id)
          .maybeSingle();
        ownerProfile = (prof as OwnerProfileRow | null) ?? null;
      }

      const targetWorkerId =
        (entry?.worker_id as string | null) ??
        (shift.accepted_by as string | null) ??
        null;

      const workers: ShiftInvoiceCandidate["workers"] = [];
      if (targetWorkerId) {
        const { data: workerRow } = await db
          .from("workers")
          .select("id,full_name,email,auth_user_id")
          .eq("id", targetWorkerId)
          .maybeSingle();

        let workerName = (workerRow?.full_name as string | null) ?? null;
        if (!workerName && workerRow?.auth_user_id) {
          const { data: wProf } = await db
            .from("profiles")
            .select("full_name")
            .eq("id", workerRow.auth_user_id)
            .maybeSingle();
          workerName = (wProf?.full_name as string | null) ?? null;
        }

        if (entry || shift.accepted_by) {
          workers.push({
            workerId: targetWorkerId,
            workerName,
            timeEntryId: (entry?.id as string | null) ?? null,
            approvalStatus: (entry?.approval_status as string | null) ?? null,
            approvedHours:
              entry?.approved_hours !== null && entry?.approved_hours !== undefined
                ? Number(entry.approved_hours)
                : null,
            reportedHours:
              entry?.reported_hours !== null && entry?.reported_hours !== undefined
                ? Number(entry.reported_hours)
                : null,
          });
        }
      }

      return {
        shift: {
          id: shift.id as string,
          storeId: shift.store_id as string,
          taskType: shift.task_type as string,
          shiftLocation: (shift.shift_location as string | null) ?? null,
          startTime: shift.start_time as string,
          endTime: shift.end_time as string,
          scheduledDuration: Number(shift.duration) || 0,
          hourlyRate:
            shift.hourly_rate !== null && shift.hourly_rate !== undefined
              ? Number(shift.hourly_rate)
              : null,
          status: shift.status as string,
          acceptedBy: (shift.accepted_by as string | null) ?? null,
          completedAt: (shift.completed_at as string | null) ?? null,
        },
        store: store
          ? {
              id: store.id as string,
              name: store.name as string,
              address: (store.address as string | null) ?? null,
              contactPhone: (store.contact_phone as string | null) ?? null,
            }
          : null,
        retailerContact: {
          userId: owner?.auth_user_id ?? null,
          name: ownerProfile?.full_name ?? null,
          email: owner?.email ?? ownerProfile?.email ?? null,
          phone:
            ownerProfile?.phone ??
            ((store?.contact_phone as string | null) ?? null),
        },
        workers,
      };
    },

    async nextInvoiceNumber(now = new Date()) {
      const db = await resolveDb();
      const [sqlCountRes, ledger] = await Promise.all([
        db.from(INVOICES_TABLE).select("id", { count: "exact", head: true }),
        readStorageLedger(db),
      ]);
      const sqlCount = sqlCountRes.error ? 0 : sqlCountRes.count ?? 0;
      const totalExisting = Math.max(sqlCount, ledger.invoices.length);
      return formatInvoiceNumber(1001 + totalExisting, now);
    },

    async saveInvoiceAndPdf(record, pdfBuffer) {
      const db = await resolveDb();
      await ensurePrivateInvoiceBucket(db);

      // Check existing in storage ledger first for duplicate protection
      const ledger = await readStorageLedger(db);
      const existingInLedger = ledger.invoices.find(
        (inv) => inv.shiftId === record.shiftId,
      );
      if (existingInLedger) {
        return { invoice: existingInLedger, duplicate: true };
      }

      // Upload PDF to private Supabase storage bucket (`retailer-invoices`).
      const { error: uploadError } = await db.storage
        .from(record.pdfStorageBucket)
        .upload(record.pdfStoragePath, pdfBuffer, {
          contentType: "application/pdf",
          cacheControl: "0",
          upsert: true,
        });
      if (uploadError) {
        console.warn(
          "[invoices] Storage upload warning:",
          uploadError.message,
        );
      }

      const generatedId = randomUUID();
      const nowIso = record.issuedAt;

      const insertPayload = {
        id: generatedId,
        invoice_number: record.invoiceNumber,
        shift_id: record.shiftId,
        store_id: record.storeId,
        retailer_user_id: record.retailerUserId,
        worker_id: record.workerId,
        time_entry_id: record.timeEntryId,
        retailer_name: record.retailerName,
        store_name: record.storeName,
        store_address: record.storeAddress,
        contact_person_name: record.contactPersonName,
        contact_phone: record.contactPhone,
        contact_email: record.contactEmail,
        shift_task_type: record.shiftTaskType,
        shift_location: record.shiftLocation,
        shift_date: record.shiftDate,
        shift_start_time: record.shiftStartTime,
        shift_end_time: record.shiftEndTime,
        approved_hours: record.approvedHours,
        hourly_rate: record.hourlyRate,
        subtotal_cents: record.subtotalCents,
        tax_cents: record.taxCents,
        total_cents: record.totalCents,
        currency: record.currency,
        line_items: record.lineItems,
        pdf_storage_bucket: record.pdfStorageBucket,
        pdf_storage_path: record.pdfStoragePath,
        pdf_size_bytes: record.pdfSizeBytes,
        pdf_sha256: record.pdfSha256,
        invoice_status: record.invoiceStatus,
        email_status: record.emailStatus,
        email_sent_at: record.emailSentAt,
        email_send_count: record.emailSendCount,
        last_emailed_to: record.lastEmailedTo,
        email_provider: record.emailProvider,
        email_provider_message_id: record.emailProviderMessageId,
        email_last_error: record.emailLastError,
        created_by: record.createdBy,
        issued_at: record.issuedAt,
      };

      const { data, error } = await db
        .from(INVOICES_TABLE)
        .insert(insertPayload)
        .select("*")
        .maybeSingle();

      if (error?.code === "23505") {
        const { data: existingRow } = await db
          .from(INVOICES_TABLE)
          .select("*")
          .eq("shift_id", record.shiftId)
          .maybeSingle();
        if (existingRow) {
          const mapped = mapRowToInvoice(existingRow as unknown as DbInvoiceRow);
          return { invoice: mapped, duplicate: true };
        }
      }

      const savedInvoice: RetailerInvoiceRecord =
        !error && data
          ? mapRowToInvoice(data as unknown as DbInvoiceRow)
          : {
              ...record,
              id: generatedId,
              createdAt: nowIso,
              updatedAt: nowIso,
            };

      // Always persist to the private Supabase Storage ledger as well so
      // invoices persist durably in Production Supabase even before SQL
      // migration 0018 is executed in the SQL Editor.
      const updatedInvoices = [
        savedInvoice,
        ...ledger.invoices.filter((inv) => inv.shiftId !== savedInvoice.shiftId),
      ];
      await writeStorageLedger(db, {
        invoices: updatedInvoices,
        emailLogs: ledger.emailLogs,
      });

      return {
        invoice: savedInvoice,
        duplicate: false,
      };
    },

    async loadInvoicePdf(invoice) {
      const db = await resolveDb();
      const generated = generateInvoicePdfBuffer(invoice);
      try {
        const { data, error } = await db.storage
          .from(invoice.pdfStorageBucket)
          .download(invoice.pdfStoragePath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          if (
            buf.byteLength > 0 &&
            buf.subarray(0, 5).toString("utf8") === "%PDF-" &&
            buf.equals(generated)
          ) {
            return buf;
          }
        }
      } catch {
        // Fall through to deterministic regeneration from the immutable stored invoice snapshot.
      }

      try {
        await ensurePrivateInvoiceBucket(db);
        await db.storage
          .from(invoice.pdfStorageBucket)
          .upload(invoice.pdfStoragePath, generated, {
            contentType: "application/pdf",
            cacheControl: "0",
            upsert: true,
          });
      } catch {
        // Ignore upload retry error
      }
      return generated;
    },

    async recordInvoiceEmailAttempt(input) {
      const db = await resolveDb();
      const nowIso = input.now.toISOString();
      const logId = randomUUID();

      await db
        .from(EMAIL_LOGS_TABLE)
        .insert({
          id: logId,
          invoice_id: input.invoiceId,
          invoice_number: input.invoiceNumber,
          recipient_email: input.recipientEmail,
          subject: input.subject,
          status: input.status,
          provider: input.provider,
          provider_message_id: input.providerMessageId,
          error: input.error ? input.error.slice(0, 500) : null,
          sent_by: input.sentBy,
          created_at: nowIso,
        })
        .then(() => {}, () => {});

      const ledger = await readStorageLedger(db);
      const currentFromLedger =
        ledger.invoices.find((inv) => inv.id === input.invoiceId) ?? null;

      const { data: currentRow } = await db
        .from(INVOICES_TABLE)
        .select("*")
        .eq("id", input.invoiceId)
        .maybeSingle();

      const current = currentRow
        ? mapRowToInvoice(currentRow as unknown as DbInvoiceRow)
        : currentFromLedger;

      if (!current) {
        throw new Error("Invoice not found");
      }

      const nextCount =
        input.status === "sent"
          ? current.emailSendCount + 1
          : current.emailSendCount;

      const nextInvoiceStatus: InvoiceStatus =
        input.status === "sent" && current.invoiceStatus === "generated"
          ? "sent"
          : current.invoiceStatus;

      const updatedInvoice: RetailerInvoiceRecord = {
        ...current,
        invoiceStatus: nextInvoiceStatus,
        emailStatus: input.status,
        emailSentAt: input.status === "sent" ? nowIso : current.emailSentAt,
        emailSendCount: nextCount,
        lastEmailedTo: input.recipientEmail,
        emailProvider: input.provider,
        emailProviderMessageId:
          input.providerMessageId ?? current.emailProviderMessageId,
        emailLastError: input.error ? input.error.slice(0, 500) : null,
        updatedAt: nowIso,
      };

      await db
        .from(INVOICES_TABLE)
        .update({
          invoice_status: updatedInvoice.invoiceStatus,
          email_status: updatedInvoice.emailStatus,
          email_sent_at: updatedInvoice.emailSentAt,
          email_send_count: updatedInvoice.emailSendCount,
          last_emailed_to: updatedInvoice.lastEmailedTo,
          email_provider: updatedInvoice.emailProvider,
          email_provider_message_id: updatedInvoice.emailProviderMessageId,
          email_last_error: updatedInvoice.emailLastError,
          updated_at: nowIso,
        })
        .eq("id", input.invoiceId)
        .then(() => {}, () => {});

      const newLog: InvoiceEmailLogEntry = {
        id: logId,
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        status: input.status,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        error: input.error ? input.error.slice(0, 500) : null,
        sentBy: input.sentBy,
        createdAt: nowIso,
      };

      await writeStorageLedger(db, {
        invoices: [
          updatedInvoice,
          ...ledger.invoices.filter((inv) => inv.id !== updatedInvoice.id),
        ],
        emailLogs: [newLog, ...ledger.emailLogs],
      });

      return updatedInvoice;
    },
  };
}

export async function loadAllInvoicesSafe(): Promise<{
  invoices: RetailerInvoiceRecord[];
  byShiftId: Map<string, RetailerInvoiceRecord>;
  tableMissing: boolean;
}> {
  await assertSuperAdmin();
  const repo = createSupabaseInvoiceRepository();
  const invoices = await repo.listInvoices();
  const byShiftId = new Map(invoices.map((inv) => [inv.shiftId, inv]));
  return { invoices, byShiftId, tableMissing: false };
}

export async function loadInvoiceEmailLogs(
  invoiceId: string,
): Promise<InvoiceEmailLogEntry[]> {
  await assertSuperAdmin();
  const db = await adminDb();

  const [sqlRes, ledger] = await Promise.all([
    db
      .from(EMAIL_LOGS_TABLE)
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
    readStorageLedger(db),
  ]);

  if (!sqlRes.error && sqlRes.data && sqlRes.data.length > 0) {
    return (sqlRes.data as {
      id: string;
      invoice_id: string;
      invoice_number: string;
      recipient_email: string;
      subject: string;
      status: "sent" | "failed";
      provider: string | null;
      provider_message_id: string | null;
      error: string | null;
      sent_by: string | null;
      created_at: string;
    }[]).map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      status: row.status,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      error: row.error,
      sentBy: row.sent_by,
      createdAt: row.created_at,
    }));
  }

  return ledger.emailLogs
    .filter((l) => l.invoiceId === invoiceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function generateRetailerInvoiceForShift(
  shiftId: string,
): Promise<GenerateInvoiceOutcome> {
  const admin = await assertSuperAdmin();
  const repo = createSupabaseInvoiceRepository();
  const result = await executeGenerateRetailerInvoice(
    {
      shiftId,
      adminUserId: admin.user.id,
    },
    repo,
  );

  if (result.ok && !result.duplicate) {
    try {
      const supabase = await createClient();
      await supabase.rpc("admin_log_action", {
        p_action: "export.retailer_invoice_generated",
        p_target_type: "shift",
        p_target_id: shiftId,
        p_metadata: {
          invoice_id: result.invoice.id,
          invoice_number: result.invoice.invoiceNumber,
          store_id: result.invoice.storeId,
          total_cents: result.invoice.totalCents,
          approved_hours: result.invoice.approvedHours,
        },
      });
    } catch {
      // Non-fatal audit log write
    }
  }

  return result;
}

export async function sendRetailerInvoiceEmailById(
  invoiceId: string,
): Promise<SendInvoiceEmailOutcome> {
  const admin = await assertSuperAdmin();
  const siteUrl = await getSiteUrl();
  const repo = createSupabaseInvoiceRepository();

  const result = await executeSendRetailerInvoiceEmail(
    {
      invoiceId,
      adminUserId: admin.user.id,
      siteUrl,
    },
    {
      repo,
      getEmailProvider,
    },
  );

  try {
    const supabase = await createClient();
    const inv = result.invoice;
    if (inv) {
      await supabase.rpc("admin_record_communication", {
        p_recipient_type: "retailer",
        p_recipient_id: inv.storeId,
        p_recipient_email: inv.lastEmailedTo ?? inv.contactEmail ?? "",
        p_subject: `Your ShiftSupport Invoice – Invoice #${inv.invoiceNumber}`,
        p_status: result.ok ? "sent" : "failed",
        p_provider: inv.emailProvider,
        p_provider_message_id: inv.emailProviderMessageId,
        p_error: result.ok ? null : result.error,
      });
    }
  } catch {
    // Non-fatal communication record write
  }

  return result;
}
