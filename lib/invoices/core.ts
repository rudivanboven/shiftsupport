import { createHash } from "node:crypto";
import type { EmailAvailability } from "../email/index";

export const DEFAULT_RETAILER_HOURLY_RATE = 28;
export const INVOICE_CURRENCY = "USD";
export const INVOICE_STORAGE_BUCKET = "retailer-invoices";

export type InvoiceStatus = "generated" | "sent" | "paid" | "void";
export type InvoiceEmailStatus = "not_sent" | "sent" | "failed";

export interface InvoiceLineItem {
  workerId: string;
  workerName: string;
  timeEntryId: string | null;
  hoursWorked: number;
  hourlyRate: number;
  totalCents: number;
}

export interface RetailerInvoiceRecord {
  id: string;
  invoiceNumber: string;
  shiftId: string;
  storeId: string;
  retailerUserId: string | null;
  workerId: string | null;
  timeEntryId: string | null;

  retailerName: string;
  storeName: string;
  storeAddress: string | null;
  contactPersonName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;

  shiftTaskType: string;
  shiftLocation: string | null;
  shiftDate: string;
  shiftStartTime: string;
  shiftEndTime: string;

  approvedHours: number;
  hourlyRate: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;

  lineItems: InvoiceLineItem[];

  pdfStorageBucket: string;
  pdfStoragePath: string;
  pdfSizeBytes: number;
  pdfSha256: string;

  invoiceStatus: InvoiceStatus;
  emailStatus: InvoiceEmailStatus;
  emailSentAt: string | null;
  emailSendCount: number;
  lastEmailedTo: string | null;
  emailProvider: string | null;
  emailProviderMessageId: string | null;
  emailLastError: string | null;

  createdBy: string | null;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftInvoiceCandidate {
  shift: {
    id: string;
    storeId: string;
    taskType: string;
    shiftLocation: string | null;
    startTime: string;
    endTime: string;
    scheduledDuration: number;
    hourlyRate: number | null;
    status: string;
    acceptedBy: string | null;
    completedAt: string | null;
  };
  store: {
    id: string;
    name: string;
    address: string | null;
    contactPhone: string | null;
  } | null;
  retailerContact: {
    userId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  workers: {
    workerId: string;
    workerName: string | null;
    timeEntryId: string | null;
    approvalStatus: string | null;
    approvedHours: number | null;
    reportedHours: number | null;
  }[];
}

export type ShiftInvoiceValidation =
  | {
      eligible: true;
      hourlyRate: number;
      approvedHours: number;
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
      currency: string;
      lineItems: InvoiceLineItem[];
      retailerName: string;
      storeName: string;
      storeAddress: string | null;
      contactPersonName: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      shiftDate: string;
    }
  | {
      eligible: false;
      reason: string;
    };

export function formatUsdCents(cents: number): string {
  const dollars = Math.round(cents) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatInvoiceDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const clean = dateStr.slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, y, m, d] = match;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = months[Number(m) - 1] ?? m;
  return `${Number(d)} ${monthName} ${y}`;
}

export function formatInvoiceNumber(sequenceNumber: number, date = new Date()): string {
  const year = date.getUTCFullYear();
  const seq = String(Math.max(1, Math.floor(sequenceNumber))).padStart(4, "0");
  return `INV-${year}-${seq}`;
}

/**
 * Validates that a shift is completed, has approved actual hours, and has
 * valid retailer and worker records before calculating the invoice totals.
 *
 * Never uses scheduled shift duration in place of actual approved hours.
 */
export function validateShiftForInvoice(
  candidate: ShiftInvoiceCandidate,
): ShiftInvoiceValidation {
  const { shift, store, retailerContact, workers } = candidate;

  if (!store || !store.name?.trim()) {
    return {
      eligible: false,
      reason: "Retailer store information is missing for this shift.",
    };
  }

  if (shift.status !== "completed") {
    return {
      eligible: false,
      reason:
        "This shift is not marked as completed yet. Invoices can only be generated for completed shifts.",
    };
  }

  if (!shift.acceptedBy && workers.length === 0) {
    return {
      eligible: false,
      reason: "No worker was hired for this shift.",
    };
  }

  if (workers.length === 0) {
    return {
      eligible: false,
      reason:
        "Actual worked hours have not been recorded for this shift yet. Record and approve the worker's hours before generating an invoice.",
    };
  }

  const hourlyRate =
    shift.hourlyRate !== null &&
    Number.isFinite(Number(shift.hourlyRate)) &&
    Number(shift.hourlyRate) > 0
      ? Math.round(Number(shift.hourlyRate) * 100) / 100
      : DEFAULT_RETAILER_HOURLY_RATE;

  if (!(hourlyRate > 0)) {
    return {
      eligible: false,
      reason: "Applicable retailer hourly billing rate is missing or invalid.",
    };
  }

  const lineItems: InvoiceLineItem[] = [];

  for (const w of workers) {
    if (w.approvalStatus !== "approved") {
      return {
        eligible: false,
        reason:
          "Actual worked hours have not been approved for this shift yet. Approve the recorded hours before generating an invoice.",
      };
    }

    const hours = Number(w.approvedHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return {
        eligible: false,
        reason:
          "Approved worked hours are missing or zero. Record and approve valid actual hours worked before generating an invoice.",
      };
    }

    const workerName = (w.workerName ?? "").trim();
    if (!workerName) {
      return {
        eligible: false,
        reason: "Worker name is missing on the shift timesheet record.",
      };
    }

    const hoursRounded = Math.round(hours * 100) / 100;
    const totalCents = Math.round(hoursRounded * hourlyRate * 100);

    lineItems.push({
      workerId: w.workerId,
      workerName,
      timeEntryId: w.timeEntryId ?? null,
      hoursWorked: hoursRounded,
      hourlyRate,
      totalCents,
    });
  }

  const approvedHours =
    Math.round(lineItems.reduce((sum, item) => sum + item.hoursWorked, 0) * 100) /
    100;
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);
  const taxCents = 0;
  const totalCents = subtotalCents + taxCents;

  const storeName = store.name.trim();
  const contactPersonName = retailerContact.name?.trim() || null;
  const retailerName = storeName;
  const contactPhone =
    retailerContact.phone?.trim() || store.contactPhone?.trim() || null;
  const contactEmail = retailerContact.email?.trim().toLowerCase() || null;
  const shiftDate = shift.startTime.slice(0, 10);

  return {
    eligible: true,
    hourlyRate,
    approvedHours,
    subtotalCents,
    taxCents,
    totalCents,
    currency: INVOICE_CURRENCY,
    lineItems,
    retailerName,
    storeName,
    storeAddress: store.address?.trim() || null,
    contactPersonName,
    contactPhone,
    contactEmail,
    shiftDate,
  };
}

/* ------------------------------------------------------------------ *
 * Professional PDF 1.4 Generator (Zero external binary dependencies)
 * ------------------------------------------------------------------ */

function pdfEscapeText(value: string): string {
  // Replace non-Latin1 characters with safe ASCII equivalents for standard Type1 Helvetica
  const ascii = value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00b7/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/[^\x20-\x7E]/g, " ");

  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function estimatePdfCharWidth(
  ch: string,
  fontSize: number,
  font: "F1" | "F2",
): number {
  const boldFactor = font === "F2" ? 1.07 : 1.0;
  if ("ilI!.,:;|'\"".includes(ch)) return fontSize * 0.29 * boldFactor;
  if (" jtf()[]-".includes(ch)) return fontSize * 0.35 * boldFactor;
  if ("r".includes(ch)) return fontSize * 0.37 * boldFactor;
  if ("mwMW@%&".includes(ch)) return fontSize * 0.78 * boldFactor;
  if (ch >= "A" && ch <= "Z") return fontSize * 0.69 * boldFactor;
  return fontSize * 0.56 * boldFactor;
}

function measurePdfTextWidth(
  text: string,
  fontSize: number,
  font: "F1" | "F2" = "F1",
): number {
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += estimatePdfCharWidth(text[i], fontSize, font);
  }
  return width;
}

function splitLongTokenToFit(
  token: string,
  maxWidth: number,
  fontSize: number,
  font: "F1" | "F2",
): string[] {
  const parts: string[] = [];
  let remaining = token;

  while (remaining.length > 0) {
    if (measurePdfTextWidth(remaining, fontSize, font) <= maxWidth) {
      parts.push(remaining);
      break;
    }

    let fitLen = 1;
    let lastBreakDelimiter = -1;
    for (let i = 1; i <= remaining.length; i += 1) {
      const candidate = remaining.slice(0, i);
      if (measurePdfTextWidth(candidate, fontSize, font) <= maxWidth) {
        fitLen = i;
        const ch = remaining[i - 1];
        if ("/-_.@,:;".includes(ch)) {
          lastBreakDelimiter = i;
        }
      } else {
        break;
      }
    }

    const cutAt =
      lastBreakDelimiter > Math.floor(fitLen * 0.4) ? lastBreakDelimiter : fitLen;
    parts.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  return parts;
}

/**
 * Wraps text into multiple lines that fit within `maxWidth` points in Helvetica,
 * preserving full content without ever truncating with `...`.
 */
export function wrapPdfText(
  value: string,
  maxWidth: number,
  fontSize: number,
  font: "F1" | "F2" = "F1",
): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const rawWords = normalized.split(" ");
  const words: string[] = [];
  for (const word of rawWords) {
    if (measurePdfTextWidth(word, fontSize, font) <= maxWidth) {
      words.push(word);
    } else {
      words.push(...splitLongTokenToFit(word, maxWidth, fontSize, font));
    }
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (measurePdfTextWidth(candidate, fontSize, font) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Generates a print-ready, multi-section business invoice PDF document (`%PDF-1.4`).
 */
export function generateInvoicePdfBuffer(
  invoice: RetailerInvoiceRecord,
): Buffer {
  const ops: string[] = [];

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: [number, number, number],
  ) => {
    ops.push(
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`,
      `${x} ${y} ${w} ${h} re f`,
    );
  };

  const strokeRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: [number, number, number],
    lineWidth = 1,
  ) => {
    ops.push(
      `${lineWidth} w`,
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG`,
      `${x} ${y} ${w} ${h} re S`,
    );
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: [number, number, number],
    lineWidth = 1,
  ) => {
    ops.push(
      `${lineWidth} w`,
      `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG`,
      `${x1} ${y1} m ${x2} ${y2} l S`,
    );
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    options: {
      font?: "F1" | "F2";
      size?: number;
      color?: [number, number, number];
    } = {},
  ) => {
    const font = options.font ?? "F1";
    const size = options.size ?? 10;
    const color = options.color ?? [0.086, 0.188, 0.141]; // #163024
    ops.push(
      "BT",
      `/${font} ${size} Tf`,
      `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`,
      `1 0 0 1 ${x} ${y} Tm`,
      `(${pdfEscapeText(text)}) Tj`,
      "ET",
    );
  };

  const INK: [number, number, number] = [0.086, 0.188, 0.141]; // #163024
  const GREEN: [number, number, number] = [0.18, 0.482, 0.235]; // #2e7b3c
  const MUTED: [number, number, number] = [0.431, 0.471, 0.435]; // #6e786f
  const SOFT_BG: [number, number, number] = [0.957, 0.941, 0.91]; // #f4f0e8
  const MINT_BG: [number, number, number] = [0.933, 0.961, 0.937]; // #eef5ef
  const BORDER: [number, number, number] = [0.875, 0.855, 0.808];
  const WHITE: [number, number, number] = [1, 1, 1];

  // Top brand accent strip
  drawRect(0, 784, 612, 8, GREEN);

  // Header area
  drawText("ShiftSupport", 48, 742, { font: "F2", size: 22, color: INK });
  drawText("Short-shift staffing for local retailers", 48, 724, {
    font: "F1",
    size: 10,
    color: MUTED,
  });

  drawText("INVOICE", 440, 742, { font: "F2", size: 22, color: GREEN });
  drawText(`#${invoice.invoiceNumber}`, 440, 723, {
    font: "F2",
    size: 12,
    color: INK,
  });

  drawLine(48, 704, 564, 704, BORDER, 1);

  // Two-column metadata cards: Bill To (left) & Invoice Details (right)
  const CARD_MAX_TEXT_WIDTH = 222;
  const CARD_TOP_Y = 688;
  const CARD_LINE_LEADING = 12.5;
  const CARD_FIELD_GAP = 2;

  interface CardFieldSpec {
    lines: string[];
    font: "F1" | "F2";
    size: number;
    color: [number, number, number];
    leading: number;
  }

  const leftFields: CardFieldSpec[] = [
    {
      lines: wrapPdfText(invoice.retailerName, CARD_MAX_TEXT_WIDTH, 11.5, "F2"),
      font: "F2",
      size: 11.5,
      color: INK,
      leading: 14,
    },
    {
      lines: wrapPdfText(
        `Store: ${invoice.storeName}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: INK,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Address: ${invoice.storeAddress ?? "Not provided"}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: MUTED,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Contact: ${invoice.contactPersonName ?? "Store Owner"}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: MUTED,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Mobile: ${invoice.contactPhone ?? "Not provided"}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: MUTED,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Email: ${invoice.contactEmail ?? "Not provided"}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: MUTED,
      leading: CARD_LINE_LEADING,
    },
  ];

  const rightFields: CardFieldSpec[] = [
    {
      lines: wrapPdfText(
        `Invoice Number: ${invoice.invoiceNumber}`,
        CARD_MAX_TEXT_WIDTH,
        10,
        "F2",
      ),
      font: "F2",
      size: 10,
      color: INK,
      leading: 13.5,
    },
    {
      lines: wrapPdfText(
        `Invoice Date: ${formatInvoiceDate(invoice.issuedAt)}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: INK,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Shift Date: ${formatInvoiceDate(invoice.shiftDate)}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: INK,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Invoice Status: ${invoice.invoiceStatus.toUpperCase()}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F2",
      ),
      font: "F2",
      size: 9.5,
      color: GREEN,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Currency: ${invoice.currency}`,
        CARD_MAX_TEXT_WIDTH,
        9.5,
        "F1",
      ),
      font: "F1",
      size: 9.5,
      color: MUTED,
      leading: CARD_LINE_LEADING,
    },
    {
      lines: wrapPdfText(
        `Shift ID: ${invoice.shiftId}`,
        CARD_MAX_TEXT_WIDTH,
        8,
        "F1",
      ),
      font: "F1",
      size: 8,
      color: MUTED,
      leading: 11,
    },
  ];

  const calcCardHeight = (fields: CardFieldSpec[]) => {
    // 18pt top header offset + 16pt after heading + sum of line heights + bottom padding
    let total = 34;
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      total += f.lines.length * f.leading;
      if (i < fields.length - 1) {
        total += CARD_FIELD_GAP;
      }
    }
    return total + 10;
  };

  const cardHeight = Math.max(
    128,
    Math.ceil(calcCardHeight(leftFields)),
    Math.ceil(calcCardHeight(rightFields)),
  );
  const cardBottomY = CARD_TOP_Y - cardHeight;

  // Draw Left Card (BILL TO)
  drawRect(48, cardBottomY, 250, cardHeight, SOFT_BG);
  strokeRect(48, cardBottomY, 250, cardHeight, BORDER, 0.75);
  drawText("BILL TO (RETAILER)", 62, CARD_TOP_Y - 18, {
    font: "F2",
    size: 9,
    color: GREEN,
  });

  let leftCursorY = CARD_TOP_Y - 35;
  for (let i = 0; i < leftFields.length; i += 1) {
    const field = leftFields[i];
    for (let l = 0; l < field.lines.length; l += 1) {
      drawText(field.lines[l], 62, leftCursorY, {
        font: field.font,
        size: field.size,
        color: field.color,
      });
      leftCursorY -= field.leading;
    }
    leftCursorY -= CARD_FIELD_GAP;
  }

  // Draw Right Card (INVOICE DETAILS)
  drawRect(314, cardBottomY, 250, cardHeight, MINT_BG);
  strokeRect(314, cardBottomY, 250, cardHeight, BORDER, 0.75);
  drawText("INVOICE DETAILS", 328, CARD_TOP_Y - 18, {
    font: "F2",
    size: 9,
    color: GREEN,
  });

  let rightCursorY = CARD_TOP_Y - 35;
  for (let i = 0; i < rightFields.length; i += 1) {
    const field = rightFields[i];
    for (let l = 0; l < field.lines.length; l += 1) {
      drawText(field.lines[l], 328, rightCursorY, {
        font: field.font,
        size: field.size,
        color: field.color,
      });
      rightCursorY -= field.leading;
    }
    rightCursorY -= CARD_FIELD_GAP;
  }

  // Shift Summary Banner (dynamically sized for multi-line shift title & location)
  const SHIFT_BANNER_MAX_TEXT_WIDTH = 488;
  const shiftLocationFull =
    invoice.shiftLocation ?? invoice.storeAddress ?? invoice.storeName;
  const combinedShiftSummary = `${invoice.shiftTaskType}  |  Location: ${shiftLocationFull}`;
  const shiftSummaryLines =
    measurePdfTextWidth(combinedShiftSummary, 9.5, "F1") <=
    SHIFT_BANNER_MAX_TEXT_WIDTH
      ? [combinedShiftSummary]
      : [
          ...wrapPdfText(
            `Task: ${invoice.shiftTaskType}`,
            SHIFT_BANNER_MAX_TEXT_WIDTH,
            9.5,
            "F1",
          ),
          ...wrapPdfText(
            `Location: ${shiftLocationFull}`,
            SHIFT_BANNER_MAX_TEXT_WIDTH,
            9.5,
            "F1",
          ),
        ];

  const shiftBannerTopY = cardBottomY - 14;
  const shiftBannerLineLeading = 13;
  const shiftBannerHeight = Math.max(
    42,
    27 + shiftSummaryLines.length * shiftBannerLineLeading,
  );
  const shiftBannerBottomY = shiftBannerTopY - shiftBannerHeight;

  drawRect(48, shiftBannerBottomY, 516, shiftBannerHeight, WHITE);
  strokeRect(48, shiftBannerBottomY, 516, shiftBannerHeight, BORDER, 0.75);
  drawText("SHIFT DETAILS", 62, shiftBannerTopY - 16, {
    font: "F2",
    size: 8.5,
    color: GREEN,
  });

  let shiftTextY = shiftBannerTopY - 30;
  for (const line of shiftSummaryLines) {
    drawText(line, 62, shiftTextY, { font: "F1", size: 9.5, color: INK });
    shiftTextY -= shiftBannerLineLeading;
  }

  // Worker & Shift Cost Table
  const tableHeaderHeight = 26;
  const tableHeaderBottomY = shiftBannerBottomY - 14 - tableHeaderHeight;
  drawRect(48, tableHeaderBottomY, 516, tableHeaderHeight, INK);
  drawText("Worker Name", 62, tableHeaderBottomY + 9, {
    font: "F2",
    size: 9.5,
    color: WHITE,
  });
  drawText("Hours Worked", 270, tableHeaderBottomY + 9, {
    font: "F2",
    size: 9.5,
    color: WHITE,
  });
  drawText("Hourly Rate", 385, tableHeaderBottomY + 9, {
    font: "F2",
    size: 9.5,
    color: WHITE,
  });
  drawText("Total", 485, tableHeaderBottomY + 9, {
    font: "F2",
    size: 9.5,
    color: WHITE,
  });

  let y = tableHeaderBottomY;
  const WORKER_COL_MAX_WIDTH = 196;
  const TABLE_LINE_LEADING = 13;

  for (let i = 0; i < invoice.lineItems.length; i += 1) {
    const item = invoice.lineItems[i];
    const workerNameLines = wrapPdfText(
      item.workerName,
      WORKER_COL_MAX_WIDTH,
      10,
      "F1",
    );
    const rowHeight = Math.max(
      28,
      15 + workerNameLines.length * TABLE_LINE_LEADING,
    );
    y -= rowHeight;

    const rowBg = i % 2 === 0 ? WHITE : SOFT_BG;
    drawRect(48, y, 516, rowHeight, rowBg);
    strokeRect(48, y, 516, rowHeight, BORDER, 0.5);

    const hoursLabel = `${item.hoursWorked.toFixed(2)} ${
      item.hoursWorked === 1 ? "Hour" : "Hours"
    }`;
    const rateLabel = `${formatUsdCents(Math.round(item.hourlyRate * 100))}/hr`;
    const totalLabel = formatUsdCents(item.totalCents);

    const firstLineY = y + rowHeight - 18;
    for (let l = 0; l < workerNameLines.length; l += 1) {
      drawText(
        workerNameLines[l],
        62,
        firstLineY - l * TABLE_LINE_LEADING,
        {
          font: "F1",
          size: 10,
          color: INK,
        },
      );
    }
    drawText(hoursLabel, 270, firstLineY, { font: "F1", size: 10, color: INK });
    drawText(rateLabel, 385, firstLineY, { font: "F1", size: 10, color: INK });
    drawText(totalLabel, 485, firstLineY, { font: "F2", size: 10, color: INK });
  }

  // Totals box on the right
  y -= 20;
  const totalsTop = y;
  drawLine(340, totalsTop, 564, totalsTop, BORDER, 1);

  drawText("Subtotal", 350, totalsTop - 18, {
    font: "F1",
    size: 10,
    color: MUTED,
  });
  drawText(formatUsdCents(invoice.subtotalCents), 485, totalsTop - 18, {
    font: "F1",
    size: 10,
    color: INK,
  });

  if (invoice.taxCents > 0) {
    drawText("Applicable Tax", 350, totalsTop - 36, {
      font: "F1",
      size: 10,
      color: MUTED,
    });
    drawText(formatUsdCents(invoice.taxCents), 485, totalsTop - 36, {
      font: "F1",
      size: 10,
      color: INK,
    });
  }

  const grandBoxY = invoice.taxCents > 0 ? totalsTop - 74 : totalsTop - 56;
  drawRect(340, grandBoxY, 224, 30, MINT_BG);
  strokeRect(340, grandBoxY, 224, 30, GREEN, 1);
  drawText(`Grand Total (${invoice.currency})`, 352, grandBoxY + 10, {
    font: "F2",
    size: 11,
    color: INK,
  });
  drawText(formatUsdCents(invoice.totalCents), 485, grandBoxY + 10, {
    font: "F2",
    size: 11,
    color: GREEN,
  });

  // Calculation note (wrapped to 516pt content width)
  const calcNoteText = `Calculation: ${invoice.approvedHours.toFixed(2)} approved hours worked x ${formatUsdCents(
    Math.round(invoice.hourlyRate * 100),
  )}/hr applicable retailer billing rate = ${formatUsdCents(invoice.totalCents)} ${
    invoice.currency
  }.`;
  const calcNoteLines = wrapPdfText(calcNoteText, 516, 9, "F1");
  let noteY = grandBoxY - 24;
  for (const line of calcNoteLines) {
    drawText(line, 48, noteY, { font: "F1", size: 9, color: MUTED });
    noteY -= 12;
  }

  // Footer (positioned at y=86, or dynamically shifted down if content above is tall)
  const footerMetaLines = wrapPdfText(
    `ShiftSupport  |  Invoice #${invoice.invoiceNumber}  |  Store: ${invoice.storeName}`,
    516,
    8,
    "F1",
  );
  const footerLineY = Math.min(86, Math.max(44 + footerMetaLines.length * 10, noteY - 10));
  drawLine(48, footerLineY, 564, footerLineY, BORDER, 0.75);
  drawText(
    "Thank you for working with ShiftSupport. For billing questions, please reply to this invoice email.",
    48,
    footerLineY - 16,
    { font: "F1", size: 8.5, color: MUTED },
  );
  let footerMetaY = footerLineY - 30;
  for (const line of footerMetaLines) {
    drawText(line, 48, footerMetaY, { font: "F1", size: 8, color: MUTED });
    footerMetaY -= 10;
  }

  const streamContent = ops.join("\n");
  const streamBytes = Buffer.byteLength(streamContent, "utf8");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    `6 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

/* ------------------------------------------------------------------ *
 * Retailer Invoice Email Template (HTML + Plain Text)
 * ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildRetailerInvoiceEmail(
  invoice: RetailerInvoiceRecord,
  siteUrl = "http://localhost:3000",
): { subject: string; text: string; html: string; attachmentFilename: string } {
  const baseUrl = siteUrl.replace(/\/+$/, "");
  const logoUrl = `${baseUrl}/images/logobalck.png`;
  const subject = `Your ShiftSupport Invoice – Invoice #${invoice.invoiceNumber}`;
  const totalFormatted = `${formatUsdCents(invoice.totalCents)} ${invoice.currency}`;
  const greetingName = invoice.contactPersonName?.trim() || invoice.storeName;

  const lineSummaries = invoice.lineItems.map(
    (item) =>
      `- ${item.workerName}: ${item.hoursWorked.toFixed(2)} hrs × ${formatUsdCents(
        Math.round(item.hourlyRate * 100),
      )}/hr = ${formatUsdCents(item.totalCents)}`,
  );

  const text = [
    `Hi ${greetingName},`,
    "",
    `Please find attached your ShiftSupport invoice #${invoice.invoiceNumber} for your completed shift at ${invoice.storeName}.`,
    "",
    `Invoice Number: ${invoice.invoiceNumber}`,
    `Invoice Date: ${formatInvoiceDate(invoice.issuedAt)}`,
    `Shift Date: ${formatInvoiceDate(invoice.shiftDate)}`,
    `Shift Task: ${invoice.shiftTaskType}`,
    "",
    "Worker & Shift Cost Summary:",
    ...lineSummaries,
    "",
    `Total Amount: ${totalFormatted}`,
    "",
    `The official PDF invoice (ShiftSupport-Invoice-${invoice.invoiceNumber}.pdf) is attached to this email for your records.`,
    "",
    "Kind regards,",
    "",
    "Rudi van Boven",
    "ShiftSupport",
  ].join("\n");

  const rowsHtml = invoice.lineItems
    .map(
      (item) => `
                  <tr>
                    <td style="padding:10px 12px; border-bottom:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#163024;">
                      ${escapeHtml(item.workerName)}
                    </td>
                    <td align="right" style="padding:10px 12px; border-bottom:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#3d4b42;">
                      ${item.hoursWorked.toFixed(2)} hrs
                    </td>
                    <td align="right" style="padding:10px 12px; border-bottom:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#3d4b42;">
                      ${escapeHtml(formatUsdCents(Math.round(item.hourlyRate * 100)))}/hr
                    </td>
                    <td align="right" style="padding:10px 12px; border-bottom:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#163024;">
                      ${escapeHtml(formatUsdCents(item.totalCents))}
                    </td>
                  </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f0e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f0e8;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <img src="${escapeHtml(logoUrl)}" alt="ShiftSupport" width="168" style="display:block; width:168px; max-width:168px; height:auto; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e3ddd1; border-top:4px solid #2e7b3c; border-radius:16px; padding:36px 36px 32px;">
              <h1 style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:1.3; font-weight:bold; color:#163024;">
                Invoice #${escapeHtml(invoice.invoiceNumber)}
              </h1>
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Hi ${escapeHtml(greetingName)},
              </p>
              <p style="margin:0 0 20px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Please find attached your ShiftSupport invoice <strong>#${escapeHtml(
                  invoice.invoiceNumber,
                )}</strong> for the completed shift at <strong>${escapeHtml(
                  invoice.storeName,
                )}</strong> on <strong>${escapeHtml(
                  formatInvoiceDate(invoice.shiftDate),
                )}</strong>.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px; border:1px solid #e3ddd1; border-radius:10px; overflow:hidden;">
                <thead>
                  <tr style="background-color:#163024;">
                    <th align="left" style="padding:10px 12px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#ffffff;">Worker Name</th>
                    <th align="right" style="padding:10px 12px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#ffffff;">Hours</th>
                    <th align="right" style="padding:10px 12px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#ffffff;">Rate</th>
                    <th align="right" style="padding:10px 12px; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#ffffff;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                  <tr style="background-color:#eef5ef;">
                    <td colspan="3" align="right" style="padding:12px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#163024;">
                      Grand Total (${escapeHtml(invoice.currency)})
                    </td>
                    <td align="right" style="padding:12px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:bold; color:#2e7b3c;">
                      ${escapeHtml(formatUsdCents(invoice.totalCents))}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p style="margin:0 0 20px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#6e786f;">
                Your official PDF invoice (<code>ShiftSupport-Invoice-${escapeHtml(
                  invoice.invoiceNumber,
                )}.pdf</code>) is attached to this email.
              </p>

              <div style="margin:24px 0 0; padding-top:18px; border-top:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Kind regards,<br>
                <strong>Rudi van Boven</strong><br>
                <span style="color:#6e786f;">ShiftSupport</span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    attachmentFilename: `ShiftSupport-Invoice-${invoice.invoiceNumber}.pdf`,
  };
}

/* ------------------------------------------------------------------ *
 * Invoice Workflow Repository & Execution Engine
 * ------------------------------------------------------------------ */

export interface InvoiceEmailLogEntry {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  subject: string;
  status: "sent" | "failed";
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  sentBy: string | null;
  createdAt: string;
}

export interface InvoiceRepository {
  getInvoiceByShiftId(shiftId: string): Promise<RetailerInvoiceRecord | null>;
  getInvoiceById(invoiceId: string): Promise<RetailerInvoiceRecord | null>;
  listInvoices(): Promise<RetailerInvoiceRecord[]>;
  getShiftCandidate(shiftId: string): Promise<ShiftInvoiceCandidate | null>;
  nextInvoiceNumber(now?: Date): Promise<string>;
  saveInvoiceAndPdf(
    record: Omit<RetailerInvoiceRecord, "id" | "createdAt" | "updatedAt">,
    pdfBuffer: Buffer,
  ): Promise<{ invoice: RetailerInvoiceRecord; duplicate: boolean }>;
  loadInvoicePdf(invoice: RetailerInvoiceRecord): Promise<Buffer>;
  recordInvoiceEmailAttempt(input: {
    invoiceId: string;
    invoiceNumber: string;
    recipientEmail: string;
    subject: string;
    status: "sent" | "failed";
    provider: string | null;
    providerMessageId: string | null;
    error: string | null;
    sentBy: string | null;
    now: Date;
  }): Promise<RetailerInvoiceRecord>;
}

export type GenerateInvoiceOutcome =
  | {
      ok: true;
      duplicate: boolean;
      invoice: RetailerInvoiceRecord;
      pdfBuffer: Buffer;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Generates an invoice for an eligible completed shift with approved hours.
 *
 * Idempotent: if an invoice already exists for `shiftId`, returns the existing
 * invoice and its PDF without generating a duplicate invoice number.
 */
export async function executeGenerateRetailerInvoice(
  input: {
    shiftId: string;
    adminUserId: string;
    now?: Date;
  },
  repo: InvoiceRepository,
): Promise<GenerateInvoiceOutcome> {
  const now = input.now ?? new Date();
  const shiftId = (input.shiftId ?? "").trim();
  if (!shiftId) {
    return { ok: false, error: "Shift ID is required." };
  }

  // 1. Check if an invoice already exists for this shift (duplicate prevention).
  const existing = await repo.getInvoiceByShiftId(shiftId);
  if (existing) {
    const pdfBuffer = await repo.loadInvoicePdf(existing);
    return {
      ok: true,
      duplicate: true,
      invoice: existing,
      pdfBuffer,
    };
  }

  // 2. Load shift, store, retailer contact, and approved timesheet data.
  const candidate = await repo.getShiftCandidate(shiftId);
  if (!candidate) {
    return { ok: false, error: "That shift could not be found." };
  }

  // 3. Validate shift completion, approved hours, and billing rate server-side.
  const validation = validateShiftForInvoice(candidate);
  if (!validation.eligible) {
    return { ok: false, error: validation.reason };
  }

  const invoiceNumber = await repo.nextInvoiceNumber(now);
  const storagePath = `stores/${candidate.shift.storeId}/${invoiceNumber}.pdf`;
  const nowIso = now.toISOString();
  const primaryLine = validation.lineItems[0];

  const draftRecord: Omit<RetailerInvoiceRecord, "id" | "createdAt" | "updatedAt"> = {
    invoiceNumber,
    shiftId: candidate.shift.id,
    storeId: candidate.shift.storeId,
    retailerUserId: candidate.retailerContact.userId,
    workerId: primaryLine?.workerId ?? candidate.shift.acceptedBy,
    timeEntryId: primaryLine?.timeEntryId ?? null,

    retailerName: validation.retailerName,
    storeName: validation.storeName,
    storeAddress: validation.storeAddress,
    contactPersonName: validation.contactPersonName,
    contactPhone: validation.contactPhone,
    contactEmail: validation.contactEmail,

    shiftTaskType: candidate.shift.taskType,
    shiftLocation: candidate.shift.shiftLocation ?? validation.storeAddress,
    shiftDate: validation.shiftDate,
    shiftStartTime: candidate.shift.startTime,
    shiftEndTime: candidate.shift.endTime,

    approvedHours: validation.approvedHours,
    hourlyRate: validation.hourlyRate,
    subtotalCents: validation.subtotalCents,
    taxCents: validation.taxCents,
    totalCents: validation.totalCents,
    currency: validation.currency,

    lineItems: validation.lineItems,

    pdfStorageBucket: INVOICE_STORAGE_BUCKET,
    pdfStoragePath: storagePath,
    pdfSizeBytes: 0,
    pdfSha256: "",

    invoiceStatus: "generated",
    emailStatus: "not_sent",
    emailSentAt: null,
    emailSendCount: 0,
    lastEmailedTo: null,
    emailProvider: null,
    emailProviderMessageId: null,
    emailLastError: null,

    createdBy: input.adminUserId,
    issuedAt: nowIso,
  };

  const pdfBuffer = generateInvoicePdfBuffer({
    ...draftRecord,
    id: "preview",
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  draftRecord.pdfSizeBytes = pdfBuffer.byteLength;
  draftRecord.pdfSha256 = createHash("sha256").update(pdfBuffer).digest("hex");

  const saved = await repo.saveInvoiceAndPdf(draftRecord, pdfBuffer);
  const finalPdf = saved.duplicate
    ? await repo.loadInvoicePdf(saved.invoice)
    : pdfBuffer;

  return {
    ok: true,
    duplicate: saved.duplicate,
    invoice: saved.invoice,
    pdfBuffer: finalPdf,
  };
}

export type SendInvoiceEmailOutcome =
  | {
      ok: true;
      invoice: RetailerInvoiceRecord;
      recipientEmail: string;
      providerMessageId: string | null;
      resent: boolean;
    }
  | {
      ok: false;
      error: string;
      invoice?: RetailerInvoiceRecord;
    };

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends (or resends) an existing Retailer Invoice PDF to the Retailer's
 * registered email address. Never creates a new invoice number on resend.
 */
export async function executeSendRetailerInvoiceEmail(
  input: {
    invoiceId: string;
    adminUserId: string;
    siteUrl?: string;
    now?: Date;
  },
  deps: {
    repo: InvoiceRepository;
    getEmailProvider: () => EmailAvailability;
  },
): Promise<SendInvoiceEmailOutcome> {
  const now = input.now ?? new Date();
  const invoice = await deps.repo.getInvoiceById(input.invoiceId);
  if (!invoice) {
    return { ok: false, error: "Invoice not found." };
  }

  // Always resolve the retailer email from the database record (never hardcoded).
  const candidate = await deps.repo.getShiftCandidate(invoice.shiftId);
  const recipientEmail = (
    candidate?.retailerContact.email ??
    invoice.contactEmail ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!recipientEmail || !SIMPLE_EMAIL_RE.test(recipientEmail)) {
    return {
      ok: false,
      error: "This retailer does not have a valid email address on file.",
      invoice,
    };
  }

  const resent = invoice.emailSendCount > 0 || invoice.emailStatus === "sent";
  const pdfBuffer = await deps.repo.loadInvoicePdf(invoice);
  const emailContent = buildRetailerInvoiceEmail(
    invoice,
    input.siteUrl ?? "http://localhost:3000",
  );

  const availability = deps.getEmailProvider();
  if (!availability.configured) {
    const updated = await deps.repo.recordInvoiceEmailAttempt({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      recipientEmail,
      subject: emailContent.subject,
      status: "failed",
      provider: null,
      providerMessageId: null,
      error: availability.reason,
      sentBy: input.adminUserId,
      now,
    });
    return {
      ok: false,
      error: `Email sending is not configured on the server: ${availability.reason}`,
      invoice: updated,
    };
  }

  try {
    const sendResult = await availability.provider.send({
      from: availability.from,
      to: recipientEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments: [
        {
          filename: emailContent.attachmentFilename,
          content: pdfBuffer.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });

    const updated = await deps.repo.recordInvoiceEmailAttempt({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      recipientEmail,
      subject: emailContent.subject,
      status: "sent",
      provider: availability.provider.id,
      providerMessageId: sendResult.providerMessageId,
      error: null,
      sentBy: input.adminUserId,
      now,
    });

    return {
      ok: true,
      invoice: updated,
      recipientEmail,
      providerMessageId: sendResult.providerMessageId,
      resent,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await deps.repo.recordInvoiceEmailAttempt({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      recipientEmail,
      subject: emailContent.subject,
      status: "failed",
      provider: availability.provider.id,
      providerMessageId: null,
      error: message,
      sentBy: input.adminUserId,
      now,
    });

    return {
      ok: false,
      error: `Could not send invoice email: ${message}`,
      invoice: updated,
    };
  }
}

/* ------------------------------------------------------------------ *
 * In-Memory Repository for deterministic automated testing
 * ------------------------------------------------------------------ */

export function createInMemoryInvoiceRepository(
  initialCandidates: ShiftInvoiceCandidate[] = [],
) {
  const candidates = new Map<string, ShiftInvoiceCandidate>(
    initialCandidates.map((c) => [c.shift.id, c]),
  );
  const invoicesById = new Map<string, RetailerInvoiceRecord>();
  const invoicesByShift = new Map<string, string>();
  const pdfStorage = new Map<string, Buffer>();
  const emailLogs: InvoiceEmailLogEntry[] = [];
  let seq = 1001;

  const repo: InvoiceRepository = {
    async getInvoiceByShiftId(shiftId) {
      const id = invoicesByShift.get(shiftId);
      return id ? invoicesById.get(id) ?? null : null;
    },

    async getInvoiceById(invoiceId) {
      return invoicesById.get(invoiceId) ?? null;
    },

    async listInvoices() {
      return [...invoicesById.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },

    async getShiftCandidate(shiftId) {
      return candidates.get(shiftId) ?? null;
    },

    async nextInvoiceNumber(now = new Date()) {
      const num = formatInvoiceNumber(seq, now);
      seq += 1;
      return num;
    },

    async saveInvoiceAndPdf(record, pdfBuffer) {
      const existingId = invoicesByShift.get(record.shiftId);
      if (existingId) {
        const existing = invoicesById.get(existingId)!;
        return { invoice: existing, duplicate: true };
      }

      const id = `inv_${invoicesById.size + 1}`;
      const nowIso = record.issuedAt;
      const full: RetailerInvoiceRecord = {
        ...record,
        id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      invoicesById.set(id, full);
      invoicesByShift.set(record.shiftId, id);
      pdfStorage.set(record.pdfStoragePath, Buffer.from(pdfBuffer));
      return { invoice: full, duplicate: false };
    },

    async loadInvoicePdf(invoice) {
      const stored = pdfStorage.get(invoice.pdfStoragePath);
      if (stored) return stored;
      const regenerated = generateInvoicePdfBuffer(invoice);
      pdfStorage.set(invoice.pdfStoragePath, regenerated);
      return regenerated;
    },

    async recordInvoiceEmailAttempt(input) {
      const existing = invoicesById.get(input.invoiceId);
      if (!existing) throw new Error("Invoice not found");
      const nowIso = input.now.toISOString();

      emailLogs.push({
        id: `log_${emailLogs.length + 1}`,
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        status: input.status,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        error: input.error,
        sentBy: input.sentBy,
        createdAt: nowIso,
      });

      const updated: RetailerInvoiceRecord = {
        ...existing,
        invoiceStatus:
          input.status === "sent" && existing.invoiceStatus === "generated"
            ? "sent"
            : existing.invoiceStatus,
        emailStatus: input.status,
        emailSentAt: input.status === "sent" ? nowIso : existing.emailSentAt,
        emailSendCount:
          input.status === "sent"
            ? existing.emailSendCount + 1
            : existing.emailSendCount,
        lastEmailedTo: input.recipientEmail,
        emailProvider: input.provider,
        emailProviderMessageId:
          input.providerMessageId ?? existing.emailProviderMessageId,
        emailLastError: input.error,
        updatedAt: nowIso,
      };

      invoicesById.set(existing.id, updated);
      return updated;
    },
  };

  return {
    repo,
    setCandidate(c: ShiftInvoiceCandidate) {
      candidates.set(c.shift.id, c);
    },
    getStoredPdf(path: string) {
      return pdfStorage.get(path) ?? null;
    },
    getEmailLogs() {
      return [...emailLogs];
    },
  };
}
