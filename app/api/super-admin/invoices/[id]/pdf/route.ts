import { NextResponse, type NextRequest } from "next/server";

import { getSuperAdmin } from "@/lib/admin/auth";
import { createSupabaseInvoiceRepository } from "@/lib/invoices/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/super-admin/invoices/[id]/pdf
 *
 * Streams the generated PDF invoice for preview (`inline`) or download
 * (`?download=1` -> `attachment`). Restricted exclusively to active Super
 * Admin sessions; anonymous users, workers, and retailers receive 404.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getSuperAdmin();
  if (!admin) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const repo = createSupabaseInvoiceRepository();
  const invoice = await repo.getInvoiceById(id);
  if (!invoice) {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  const pdfBuffer = await repo.loadInvoicePdf(invoice);
  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = `ShiftSupport-Invoice-${invoice.invoiceNumber}.pdf`;
  const disposition = download ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Invoice-Number": invoice.invoiceNumber,
    },
  });
}
