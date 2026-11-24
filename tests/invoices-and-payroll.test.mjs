import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createResendProvider } from "../lib/email/providers/resend.ts";
import {
  createAdpPayrollProvider,
  inspectAdpConfiguration,
  prepareAdpPayrollBatch,
} from "../lib/payroll/adp.ts";
import {
  buildRetailerInvoiceEmail,
  createInMemoryInvoiceRepository,
  executeGenerateRetailerInvoice,
  executeSendRetailerInvoiceEmail,
  generateInvoicePdfBuffer,
  validateShiftForInvoice,
  wrapPdfText,
} from "../lib/invoices/core.ts";

const SAMPLE_COMPLETED_SHIFT = {
  shift: {
    id: "11111111-2222-3333-4444-555555555555",
    storeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    taskType: "Saturday shop floor support",
    shiftLocation: "Keizersgracht 121, Amsterdam",
    startTime: "2026-11-20T09:00:00",
    endTime: "2026-11-20T17:00:00",
    scheduledDuration: 8, // Scheduled was 8 hours, but actual approved was 6 hours
    hourlyRate: 28,
    status: "completed",
    acceptedBy: "99999999-8888-7777-6666-555555555555",
    completedAt: "2026-11-20T17:15:00Z",
  },
  store: {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Verhoeven Grocers",
    address: "Keizersgracht 121, Amsterdam",
    contactPhone: "+31 20 123 4567",
  },
  retailerContact: {
    userId: "user-retailer-1",
    name: "Sam Verhoeven",
    email: "sam@verhoeven.test",
    phone: "+31 6 12 34 56 78",
  },
  workers: [
    {
      workerId: "99999999-8888-7777-6666-555555555555",
      workerName: "Alex Doyle",
      timeEntryId: "entry-1",
      approvalStatus: "approved",
      approvedHours: 6,
      reportedHours: 6,
    },
  ],
};

test("1 & 2. Retailer shift posting publishes directly without Stripe checkout", async () => {
  const [
    shiftsAction,
    postShiftForm,
    retailerShiftsPage,
    retailerDashboardPage,
    shiftSummaryPage,
    payShiftButton,
    billingAction,
  ] = await Promise.all([
    readFile(new URL("../app/actions/shifts.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/retailer/(app)/shifts/new/PostShiftForm.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/retailer/(app)/shifts/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/retailer/(app)/dashboard/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/retailer/(app)/shifts/[id]/payment/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/retailer/(app)/shifts/[id]/payment/PayShiftButton.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/actions/billing.ts", import.meta.url), "utf8"),
  ]);

  // createShift and createRecurringShift insert status: "open" and redirect to /retailer/shifts
  assert.match(shiftsAction, /status:\s*"open"/);
  assert.match(shiftsAction, /redirect\("\/retailer\/shifts"\)/);
  assert.doesNotMatch(shiftsAction, /redirect\(`\/retailer\/shifts\/\$\{shiftId\}\/payment`\)/);

  // User-facing pages do not render Stripe payment buttons
  assert.doesNotMatch(postShiftForm, /Continue to payment/);
  assert.doesNotMatch(retailerShiftsPage, /PayShiftButton/);
  assert.doesNotMatch(retailerDashboardPage, /Complete payment/);
  assert.doesNotMatch(shiftSummaryPage, /Continue to payment/);
  assert.match(payShiftButton, /return null/);

  // createShiftPaymentSession refuses to initiate new Stripe checkouts
  assert.match(
    billingAction,
    /Online Stripe payment has been removed/,
  );
  assert.doesNotMatch(billingAction, /CHECKOUT_KIND\.retailerShift/);
});

test("3. ADP Payroll integration reports missing credentials honestly and submits when configured", async () => {
  // Unconfigured state: must not fake connection
  const unconfigured = inspectAdpConfiguration({});
  assert.equal(unconfigured.connected, false);
  assert.ok(unconfigured.missingRequirements.length >= 4);

  const unconfiguredProvider = createAdpPayrollProvider({});
  assert.equal(unconfiguredProvider.isConfigured(), false);
  const rejected = await unconfiguredProvider.submit([], "adp-batch-1");
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /ADP Payroll API is not connected/);

  // Batch preparation: rejects unmapped workers and duplicate shift lines
  const unmappedBatch = prepareAdpPayrollBatch(
    [
      {
        shiftId: "shift-1",
        workerId: "worker-1",
        workerName: "Alex Doyle",
        workerEmail: "alex@worker.test",
        externalEmployeeId: null,
        storeName: "Verhoeven Grocers",
        shiftDate: "2026-11-20",
        actualStart: "2026-11-20T09:00:00",
        actualEnd: "2026-11-20T15:00:00",
        breakMinutes: 0,
        approvedHours: 6,
        hourlyRate: 20,
        grossAmount: 120,
        approvedAt: "2026-11-20T18:00:00Z",
      },
    ],
    { batchId: "adp-1", companyCode: "SS01" },
  );
  assert.equal(unmappedBatch.ready, false);
  assert.equal(unmappedBatch.unmappedWorkers.length, 1);
  assert.match(unmappedBatch.validationErrors[0], /missing an ADP employee ID/);

  // Configured ADP provider with mocked OAuth + Pay Data Input endpoints
  const calls = [];
  const configuredProvider = createAdpPayrollProvider({
    product: "workforce_now",
    clientId: "adp_client_id",
    clientSecret: "adp_client_secret",
    sslCert: "-----BEGIN CERTIFICATE-----...",
    sslKey: "-----BEGIN PRIVATE KEY-----...",
    tokenUrl: "https://accounts.adp.com/auth/oauth/v2/token",
    payDataInputUrl: "https://api.adp.com/payroll/v1/pay-data-input",
    companyCode: "SS01",
    earningsCode: "REG",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (String(url).includes("/oauth/v2/token")) {
        return new Response(JSON.stringify({ access_token: "adp_tok_123" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ confirmMessage: { resourceID: "ADP-CONFIRM-777" } }),
        { status: 200 },
      );
    },
  });

  assert.equal(configuredProvider.isConfigured(), true);
  const submitted = await configuredProvider.submit(
    [
      {
        shiftId: "shift-1",
        workerId: "worker-1",
        workerName: "Alex Doyle",
        workerEmail: "alex@worker.test",
        externalEmployeeId: "ADP-ASSOC-01",
        storeName: "Verhoeven Grocers",
        shiftDate: "2026-11-20",
        actualStart: "2026-11-20T09:00:00",
        actualEnd: "2026-11-20T15:00:00",
        breakMinutes: 0,
        approvedHours: 6,
        hourlyRate: 20,
        grossAmount: 120,
        approvedAt: "2026-11-20T18:00:00Z",
      },
    ],
    "adp-batch-100",
  );

  assert.equal(submitted.ok, true);
  assert.equal(submitted.externalRef, "ADP-CONFIRM-777");
  assert.equal(calls.length, 2);
});

test("4. Completed shift eligibility: rejects incomplete or unapproved shifts and never uses scheduled duration", async () => {
  // Incomplete shift (status = 'open' or 'filled')
  const openShift = validateShiftForInvoice({
    ...SAMPLE_COMPLETED_SHIFT,
    shift: { ...SAMPLE_COMPLETED_SHIFT.shift, status: "filled" },
  });
  assert.equal(openShift.eligible, false);
  assert.match(openShift.reason, /Invoices can only be generated for completed shifts/);

  // Completed shift but hours not recorded
  const noHours = validateShiftForInvoice({
    ...SAMPLE_COMPLETED_SHIFT,
    workers: [],
  });
  assert.equal(noHours.eligible, false);
  assert.match(noHours.reason, /Actual worked hours have not been recorded/);

  // Completed shift with recorded hours that are not approved yet
  const unapproved = validateShiftForInvoice({
    ...SAMPLE_COMPLETED_SHIFT,
    workers: [
      {
        ...SAMPLE_COMPLETED_SHIFT.workers[0],
        approvalStatus: "submitted",
        approvedHours: null,
        reportedHours: 6,
      },
    ],
  });
  assert.equal(unapproved.eligible, false);
  assert.match(unapproved.reason, /Actual worked hours have not been approved/);
});

test("5, 6, 7 & 8. Generates PDF invoice with Retailer details, Worker table, approved hours calculation, and valid PDF binary", async () => {
  const store = createInMemoryInvoiceRepository([SAMPLE_COMPLETED_SHIFT]);

  const generated = await executeGenerateRetailerInvoice(
    {
      shiftId: SAMPLE_COMPLETED_SHIFT.shift.id,
      adminUserId: "admin-1",
      now: new Date("2026-11-24T12:00:00Z"),
    },
    store.repo,
  );

  assert.equal(generated.ok, true);
  assert.equal(generated.duplicate, false);

  const { invoice, pdfBuffer } = generated;
  assert.equal(invoice.invoiceNumber, "INV-2026-1001");
  assert.equal(invoice.retailerName, "Verhoeven Grocers");
  assert.equal(invoice.storeName, "Verhoeven Grocers");
  assert.equal(invoice.storeAddress, "Keizersgracht 121, Amsterdam");
  assert.equal(invoice.contactPersonName, "Sam Verhoeven");
  assert.equal(invoice.contactPhone, "+31 6 12 34 56 78");
  assert.equal(invoice.contactEmail, "sam@verhoeven.test");

  // Calculation must use actual approved hours (6 hrs), NOT scheduled hours (8 hrs)
  // 6 hrs * $28/hr = $168.00 (16800 cents)
  assert.equal(invoice.approvedHours, 6);
  assert.equal(invoice.hourlyRate, 28);
  assert.equal(invoice.subtotalCents, 16800);
  assert.equal(invoice.taxCents, 0);
  assert.equal(invoice.totalCents, 16800);
  assert.equal(invoice.currency, "USD");
  assert.equal(invoice.lineItems.length, 1);
  assert.deepEqual(invoice.lineItems[0], {
    workerId: "99999999-8888-7777-6666-555555555555",
    workerName: "Alex Doyle",
    timeEntryId: "entry-1",
    hoursWorked: 6,
    hourlyRate: 28,
    totalCents: 16800,
  });

  // Verify PDF binary structure and embedded content
  const pdfText = pdfBuffer.toString("utf8");
  assert.ok(pdfText.startsWith("%PDF-1.4\n"));
  assert.ok(pdfText.trimEnd().endsWith("%%EOF"));
  assert.ok(pdfText.includes("INV-2026-1001"));
  assert.ok(pdfText.includes("Verhoeven Grocers"));
  assert.ok(pdfText.includes("Keizersgracht 121, Amsterdam"));
  assert.ok(pdfText.includes("Sam Verhoeven"));
  assert.ok(pdfText.includes("+31 6 12 34 56 78"));
  assert.ok(pdfText.includes("sam@verhoeven.test"));
  assert.ok(pdfText.includes("Alex Doyle"));
  assert.ok(pdfText.includes("6.00 Hours"));
  assert.ok(pdfText.includes("$28.00/hr"));
  assert.ok(pdfText.includes("$168.00"));

  // Multi-worker shift calculation test
  const multiWorkerCandidate = {
    ...SAMPLE_COMPLETED_SHIFT,
    shift: {
      ...SAMPLE_COMPLETED_SHIFT.shift,
      id: "22222222-3333-4444-5555-666666666666",
    },
    workers: [
      {
        workerId: "w-1",
        workerName: "Worker A",
        timeEntryId: "te-1",
        approvalStatus: "approved",
        approvedHours: 6,
        reportedHours: 6,
      },
      {
        workerId: "w-2",
        workerName: "Worker B",
        timeEntryId: "te-2",
        approvalStatus: "approved",
        approvedHours: 4.5,
        reportedHours: 4.5,
      },
    ],
  };
  const multiVal = validateShiftForInvoice(multiWorkerCandidate);
  assert.equal(multiVal.eligible, true);
  assert.equal(multiVal.lineItems.length, 2);
  assert.equal(multiVal.approvedHours, 10.5);
  assert.equal(multiVal.totalCents, Math.round(10.5 * 28 * 100)); // $294.00
});

test("9 & 10. Duplicate invoice prevention and sending/resending invoice email with PDF attachment", async () => {
  const store = createInMemoryInvoiceRepository([SAMPLE_COMPLETED_SHIFT]);

  const firstGen = await executeGenerateRetailerInvoice(
    {
      shiftId: SAMPLE_COMPLETED_SHIFT.shift.id,
      adminUserId: "admin-1",
      now: new Date("2026-11-24T12:00:00Z"),
    },
    store.repo,
  );
  assert.equal(firstGen.ok, true);
  assert.equal(firstGen.duplicate, false);
  assert.equal(firstGen.invoice.invoiceNumber, "INV-2026-1001");

  // Second click on Generate Invoice for the same shift must return the existing invoice
  const secondGen = await executeGenerateRetailerInvoice(
    {
      shiftId: SAMPLE_COMPLETED_SHIFT.shift.id,
      adminUserId: "admin-1",
      now: new Date("2026-11-24T12:05:00Z"),
    },
    store.repo,
  );
  assert.equal(secondGen.ok, true);
  assert.equal(secondGen.duplicate, true);
  assert.equal(secondGen.invoice.id, firstGen.invoice.id);
  assert.equal(secondGen.invoice.invoiceNumber, "INV-2026-1001");

  const allInvoices = await store.repo.listInvoices();
  assert.equal(allInvoices.length, 1);

  // Send Invoice Email through Resend adapter with PDF attachment
  const apiRequests = [];
  const resendProvider = createResendProvider({
    apiKey: "re_test_invoice_key",
    apiUrl: "https://api.resend.com/emails",
    fetchImpl: async (url, init) => {
      apiRequests.push({ url, init });
      return new Response(
        JSON.stringify({ id: `re_inv_msg_${apiRequests.length}` }),
        { status: 200 },
      );
    },
  });

  const getEmailProvider = () => ({
    configured: true,
    provider: resendProvider,
    from: "ShiftSupport <billing@shiftsupport.com>",
  });

  const firstSend = await executeSendRetailerInvoiceEmail(
    {
      invoiceId: firstGen.invoice.id,
      adminUserId: "admin-1",
      siteUrl: "https://shiftsupport.app",
      now: new Date("2026-11-24T12:10:00Z"),
    },
    { repo: store.repo, getEmailProvider },
  );

  assert.equal(firstSend.ok, true);
  assert.equal(firstSend.resent, false);
  assert.equal(firstSend.recipientEmail, "sam@verhoeven.test");
  assert.equal(firstSend.invoice.invoiceStatus, "sent");
  assert.equal(firstSend.invoice.emailStatus, "sent");
  assert.equal(firstSend.invoice.emailSendCount, 1);

  assert.equal(apiRequests.length, 1);
  const sentBody = JSON.parse(apiRequests[0].init.body);
  assert.deepEqual(sentBody.to, ["sam@verhoeven.test"]);
  assert.equal(
    sentBody.subject,
    "Your ShiftSupport Invoice – Invoice #INV-2026-1001",
  );
  assert.ok(sentBody.text.includes("INV-2026-1001"));
  assert.ok(sentBody.text.includes("$168.00 USD"));
  assert.equal(sentBody.attachments.length, 1);
  assert.equal(
    sentBody.attachments[0].filename,
    "ShiftSupport-Invoice-INV-2026-1001.pdf",
  );
  assert.equal(sentBody.attachments[0].content_type, "application/pdf");

  const decodedAttachment = Buffer.from(
    sentBody.attachments[0].content,
    "base64",
  ).toString("utf8");
  assert.ok(decodedAttachment.startsWith("%PDF-1.4\n"));
  assert.ok(decodedAttachment.includes("INV-2026-1001"));

  // Resending must send the existing invoice PDF with the exact same invoice number
  const resendResult = await executeSendRetailerInvoiceEmail(
    {
      invoiceId: firstGen.invoice.id,
      adminUserId: "admin-1",
      siteUrl: "https://shiftsupport.app",
      now: new Date("2026-11-24T13:00:00Z"),
    },
    { repo: store.repo, getEmailProvider },
  );

  assert.equal(resendResult.ok, true);
  assert.equal(resendResult.resent, true);
  assert.equal(resendResult.invoice.invoiceNumber, "INV-2026-1001");
  assert.equal(resendResult.invoice.emailSendCount, 2);
  assert.equal(store.getEmailLogs().length, 2);
});

test("11. Super Admin authorization and database RLS guards for invoices", async () => {
  const [
    migration0018,
    pdfRoute,
    invoicesPage,
    invoiceDetailPage,
    superAdminActions,
  ] = await Promise.all([
    readFile(
      new URL(
        "../supabase/migrations/0018_remove_stripe_checkout_and_retailer_invoices.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/super-admin/invoices/[id]/pdf/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/super-admin/(console)/invoices/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/super-admin/(console)/invoices/[id]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/actions/super-admin.ts", import.meta.url),
      "utf8",
    ),
  ]);

  // SQL migration 0018 enforces unique shift_id, unique invoice_number, RLS, and private storage
  assert.match(
    migration0018,
    /create unique index if not exists retailer_invoices_shift_id_key\s+on public\.retailer_invoices \(shift_id\)/i,
  );
  assert.match(
    migration0018,
    /create unique index if not exists retailer_invoices_invoice_number_key\s+on public\.retailer_invoices \(invoice_number\)/i,
  );
  assert.match(
    migration0018,
    /alter table public\.retailer_invoices enable row level security/i,
  );
  assert.match(
    migration0018,
    /revoke all on public\.retailer_invoices from public, anon, authenticated/i,
  );
  assert.match(migration0018, /using \(public\.is_super_admin\(\)\)/i);
  assert.match(
    migration0018,
    /values \('retailer-invoices', 'retailer-invoices', false\)/i,
  );

  // PDF route, pages, and actions enforce Super Admin authentication
  assert.match(pdfRoute, /const admin = await getSuperAdmin\(\)/);
  assert.match(pdfRoute, /if \(!admin\)/);
  assert.match(invoicesPage, /await requireSuperAdmin\(\)/);
  assert.match(invoiceDetailPage, /await requireSuperAdmin\(\)/);
  assert.match(
    superAdminActions,
    /export async function generateRetailerInvoiceAction[\s\S]*?const denied = await guard\(\)/,
  );
  assert.match(
    superAdminActions,
    /export async function sendRetailerInvoiceEmailAction[\s\S]*?const denied = await guard\(\)/,
  );
});

test("12. PDF multi-line wrapping & dynamic layout: shows complete demo and long addresses, names, and locations without truncation or overlap", async () => {
  // 1. Test exact INV-2026-1001 Demo Invoice record that previously truncated with '...'
  const demoCandidate = {
    shift: {
      id: "de79279c-b28a-4803-a3dd-fa7292e5cbb5",
      storeId: "85532fa6-235d-4dbc-9b96-2a31ee99ecd5",
      taskType: "Invoice QA Demo Shift",
      shiftLocation: "100 Demo Avenue, Testville, TX 00000, USA",
      startTime: "2026-11-23T09:00:00",
      endTime: "2026-11-23T15:00:00",
      scheduledDuration: 6,
      hourlyRate: 28,
      status: "completed",
      acceptedBy: "64d515e7-9320-4337-b076-b8c4f04bff21",
      completedAt: "2026-11-23T15:05:00Z",
    },
    store: {
      id: "85532fa6-235d-4dbc-9b96-2a31ee99ecd5",
      name: "Invoice QA Demo Store",
      address: "100 Demo Avenue, Testville, TX 00000, USA",
      contactPhone: "+1 202-555-0147",
    },
    retailerContact: {
      userId: "cb8cbf44-c0ed-4b06-8903-136d81a0daf4",
      name: "Alex Demo (ShiftSupport Invoice QA Retailer)",
      email: "invoice-qa@shiftsupport.test",
      phone: "+1 202-555-0147",
    },
    workers: [
      {
        workerId: "64d515e7-9320-4337-b076-b8c4f04bff21",
        workerName: "Invoice QA Worker",
        timeEntryId: "3e9d03f2-c320-42f5-8eba-a91fbde42c61",
        approvalStatus: "approved",
        approvedHours: 6,
        reportedHours: 6,
      },
    ],
  };

  const demoStore = createInMemoryInvoiceRepository([demoCandidate]);
  const demoGen = await executeGenerateRetailerInvoice(
    {
      shiftId: demoCandidate.shift.id,
      adminUserId: "admin-1",
      now: new Date("2026-11-24T17:00:00Z"),
    },
    demoStore.repo,
  );
  assert.equal(demoGen.ok, true);

  const demoPdfText = demoGen.pdfBuffer.toString("utf8");
  assert.ok(!demoPdfText.includes("..."), "Demo PDF must not truncate any field with '...'");

  // Extract all rendered text lines from PDF Tj commands in order
  const extractRenderedLines = (rawPdf) =>
    [...rawPdf.matchAll(/1 0 0 1 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) Tm\n\((.*)\) Tj/g)].map(
      (m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
        text: m[3].replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\"),
      }),
    );

  const demoLines = extractRenderedLines(demoPdfText);
  const joinedDemoText = demoLines.map((l) => l.text).join(" ");

  // Complete retailer address, contact name, and shift location must be present in full
  assert.ok(
    joinedDemoText.includes("Address: 100 Demo Avenue, Testville, TX 00000, USA"),
    "Complete retailer address must be rendered",
  );
  assert.ok(
    joinedDemoText.includes("Contact: Alex Demo (ShiftSupport Invoice QA Retailer)"),
    "Complete contact name and business details must be rendered",
  );
  assert.ok(
    joinedDemoText.includes(
      "Invoice QA Demo Shift  |  Location: 100 Demo Avenue, Testville, TX 00000, USA",
    ),
    "Complete shift task and shift location must be rendered",
  );

  // 2. Test very long multi-line addresses, business names, contact names, shift locations, and worker names
  const longCandidate = {
    shift: {
      id: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
      storeId: "cccccccc-dddd-eeee-ffff-000000000000",
      taskType:
        "Senior Holiday Visual Merchandising, Inventory Reconciliation & Flagship Floor Support",
      shiftLocation:
        "Suite 1400-B, Building 3, 98765 International Commerce Parkway Boulevard, South Harbor District, San Francisco, CA 94107-1234, United States of America",
      startTime: "2026-11-23T09:00:00",
      endTime: "2026-11-23T15:00:00",
      scheduledDuration: 6,
      hourlyRate: 28,
      status: "completed",
      acceptedBy: "w-long-1",
      completedAt: "2026-11-23T15:05:00Z",
    },
    store: {
      id: "cccccccc-dddd-eeee-ffff-000000000000",
      name: "The Grand Metropolitan Flagship Department & Artisan Provisions Emporium at Embarcadero Center",
      address:
        "Suite 1400-B, Building 3, 98765 International Commerce Parkway Boulevard, South Harbor District, San Francisco, CA 94107-1234, United States of America",
      contactPhone: "+1 (415) 555-0199 ext. 4421",
    },
    retailerContact: {
      userId: "user-long-1",
      name: "Alexandra Bartholomew-Van Der Berghe (Regional Director of Store Operations & Staffing)",
      email: "alexandra.bartholomew-vanderberghe.operations@grandmetropolitan-flagship.test",
      phone: "+1 (415) 555-0199 ext. 4421",
    },
    workers: [
      {
        workerId: "w-long-1",
        workerName: "Maximilian Christopher Montgomery-Featherstonehaugh III",
        timeEntryId: "te-long-1",
        approvalStatus: "approved",
        approvedHours: 6,
        reportedHours: 6,
      },
    ],
  };

  const longStore = createInMemoryInvoiceRepository([longCandidate]);
  const longGen = await executeGenerateRetailerInvoice(
    {
      shiftId: longCandidate.shift.id,
      adminUserId: "admin-1",
      now: new Date("2026-11-24T17:00:00Z"),
    },
    longStore.repo,
  );
  assert.equal(longGen.ok, true);

  const longPdfText = longGen.pdfBuffer.toString("utf8");
  assert.ok(!longPdfText.includes("..."), "Long PDF must wrap lines instead of truncating with '...'");

  const longLines = extractRenderedLines(longPdfText);
  const joinedLongText = longLines.map((l) => l.text).join(" ");
  const joinedLongCompact = longLines.map((l) => l.text).join("");

  // Every full string (normalized across wrapped lines) must appear in full
  assert.ok(joinedLongText.includes(longCandidate.store.name));
  assert.ok(joinedLongText.includes(longCandidate.store.address));
  assert.ok(joinedLongText.includes(longCandidate.retailerContact.name));
  assert.ok(joinedLongCompact.includes(longCandidate.retailerContact.email));
  assert.ok(joinedLongText.includes(longCandidate.shift.taskType));
  assert.ok(joinedLongText.includes(longCandidate.shift.shiftLocation));
  assert.ok(joinedLongText.includes(longCandidate.workers[0].workerName));

  // Verify dynamic vertical ordering (no section overlap):
  // Bill To card bottom > Shift Details header Y > Worker table header Y > Subtotal Y > Grand Total Y > Calculation note Y > Footer Y
  const findLineY = (prefix) => {
    const found = longLines.find((l) => l.text.startsWith(prefix));
    assert.ok(found, `Expected line starting with "${prefix}"`);
    return found.y;
  };

  const lastEmailLineY = longLines
    .filter((l) => l.x === 62 && l.y > 400)
    .reduce((minY, l) => Math.min(minY, l.y), 999);
  const shiftDetailsHeaderY = findLineY("SHIFT DETAILS");
  const workerTableHeaderY = findLineY("Worker Name");
  const subtotalY = findLineY("Subtotal");
  const grandTotalY = findLineY("Grand Total");
  const calculationY = findLineY("Calculation:");
  const footerThankYouY = findLineY("Thank you for working with ShiftSupport");

  assert.ok(
    lastEmailLineY > shiftDetailsHeaderY + 14,
    `Bill To text (${lastEmailLineY}) must stay above Shift Details (${shiftDetailsHeaderY})`,
  );
  assert.ok(
    shiftDetailsHeaderY > workerTableHeaderY + 28,
    `Shift Details (${shiftDetailsHeaderY}) must stay above Worker Table (${workerTableHeaderY})`,
  );
  assert.ok(
    workerTableHeaderY > subtotalY + 30,
    `Worker Table (${workerTableHeaderY}) must stay above Subtotal (${subtotalY})`,
  );
  assert.ok(
    subtotalY > grandTotalY + 15,
    `Subtotal (${subtotalY}) must stay above Grand Total (${grandTotalY})`,
  );
  assert.ok(
    grandTotalY > calculationY + 15,
    `Grand Total (${grandTotalY}) must stay above Calculation note (${calculationY})`,
  );
  assert.ok(
    calculationY > footerThankYouY + 15,
    `Calculation note (${calculationY}) must stay above Footer (${footerThankYouY})`,
  );
});
