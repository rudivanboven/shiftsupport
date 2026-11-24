"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  generateRetailerInvoiceAction,
  sendRetailerInvoiceEmailAction,
  type InvoiceActionState,
} from "@/app/actions/super-admin";
import styles from "./Admin.module.css";

export interface InvoiceActionSummary {
  id: string;
  invoiceNumber: string;
  invoiceStatus: "generated" | "sent" | "paid" | "void";
  emailStatus: "not_sent" | "sent" | "failed";
  emailSentAt: string | null;
  emailSendCount: number;
  contactEmail: string | null;
}

const IconDocView = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5.5 3.2h6.3l3.7 3.7v9.9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1Z" />
    <path d="M11.6 3.3v3.8h3.8" />
    <path d="M7.5 10.5h5M7.5 13.5h3.5" />
  </svg>
);

const IconEyePreview = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.2 10s2.9-5.2 7.8-5.2 7.8 5.2 7.8 5.2-2.9 5.2-7.8 5.2S2.2 10 2.2 10Z" />
    <circle cx="10" cy="10" r="2.3" />
  </svg>
);

const IconDownloadPdf = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3.5v9.2" />
    <path d="m6.5 9.6 3.5 3.5 3.5-3.5" />
    <path d="M4 15.8h12" />
  </svg>
);

const IconSendMail = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.6" y="4.2" width="14.8" height="11.6" rx="2" />
    <path d="m3.4 5.2 6.6 5.1 6.6-5.1" />
  </svg>
);

export function GenerateOrManageInvoiceActions({
  shiftId,
  eligible,
  ineligibleReason,
  existingInvoice,
  autoPreviewOnGenerate = true,
  compact = false,
  showRecipientMeta = false,
}: {
  shiftId: string;
  eligible: boolean;
  ineligibleReason?: string;
  existingInvoice?: InvoiceActionSummary | null;
  autoPreviewOnGenerate?: boolean;
  compact?: boolean;
  showRecipientMeta?: boolean;
}) {
  const router = useRouter();
  const [genState, genAction, genPending] = useActionState<
    InvoiceActionState,
    FormData
  >(generateRetailerInvoiceAction, {});

  const [sendState, sendAction, sendPending] = useActionState<
    InvoiceActionState,
    FormData
  >(sendRetailerInvoiceEmailAction, {});

  const [previewOpen, setPreviewOpen] = useState(false);

  const activeInvoiceId = existingInvoice?.id ?? genState.invoiceId ?? null;
  const activeInvoiceNumber =
    existingInvoice?.invoiceNumber ?? genState.invoiceNumber ?? null;

  useEffect(() => {
    if (genState.invoiceId && autoPreviewOnGenerate) {
      setPreviewOpen(true);
      router.refresh();
    }
  }, [genState.invoiceId, autoPreviewOnGenerate, router]);

  if (!activeInvoiceId) {
    if (!eligible) {
      return (
        <span className={styles.sub} title={ineligibleReason}>
          {ineligibleReason ?? "Not eligible for invoice yet"}
        </span>
      );
    }

    return (
      <div>
        <form action={genAction} className={styles.inlineForm}>
          <input type="hidden" name="shiftId" value={shiftId} />
          <button
            type="submit"
            disabled={genPending}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnPrimary}`}
          >
            <IconDocView />
            <span>{genPending ? "Generating PDF…" : "Generate Invoice"}</span>
          </button>
        </form>
        {genState.error ? (
          <span className={`${styles.sub} ${styles.warnText}`}>
            {genState.error}
          </span>
        ) : null}
      </div>
    );
  }

  const pdfPreviewUrl = `/api/super-admin/invoices/${activeInvoiceId}/pdf`;
  const pdfDownloadUrl = `/api/super-admin/invoices/${activeInvoiceId}/pdf?download=1`;
  const detailUrl = `/super-admin/invoices/${activeInvoiceId}`;
  const alreadySent =
    existingInvoice?.emailStatus === "sent" ||
    (existingInvoice?.emailSendCount ?? 0) > 0 ||
    Boolean(sendState.emailSent);

  return (
    <div>
      <div className={styles.invoiceActionBar}>
        {showRecipientMeta ? (
          <div className={styles.invoiceActionMeta}>
            <span>
              Retailer recipient:{" "}
              <strong className={styles.invoiceActionMetaStrong}>
                {existingInvoice?.contactEmail ?? "No email on file"}
              </strong>
            </span>
            {existingInvoice?.emailSendCount ? (
              <span>
                · Emailed {existingInvoice.emailSendCount}{" "}
                {existingInvoice.emailSendCount === 1 ? "time" : "times"}
              </span>
            ) : (
              <span>· Ready to send PDF invoice</span>
            )}
          </div>
        ) : null}

        <div className={styles.invoiceActionButtons}>
          <Link
            href={detailUrl}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
          >
            <IconDocView />
            <span>View Invoice</span>
          </Link>

          {!compact ? (
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary} ${
                previewOpen ? styles.invoiceBtnActive : ""
              }`}
            >
              <IconEyePreview />
              <span>{previewOpen ? "Hide Preview" : "Preview PDF"}</span>
            </button>
          ) : null}

          <a
            href={pdfDownloadUrl}
            className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
          >
            <IconDownloadPdf />
            <span>Download PDF</span>
          </a>

          <form action={sendAction} style={{ display: "inline-flex", margin: 0 }}>
            <input type="hidden" name="invoiceId" value={activeInvoiceId} />
            <button
              type="submit"
              disabled={sendPending}
              className={`${styles.invoiceBtn} ${styles.invoiceBtnPrimary}`}
            >
              <IconSendMail />
              <span>
                {sendPending
                  ? "Sending…"
                  : alreadySent
                    ? "Send Email"
                    : "Send Email"}
              </span>
            </button>
          </form>
        </div>
      </div>

      {genState.success || sendState.success || sendState.error ? (
        <div className={styles.invoiceFeedbackRow}>
          {genState.success ? <span>{genState.success} </span> : null}
          {sendState.success ? <span>{sendState.success} </span> : null}
          {sendState.error ? (
            <span className={styles.warnText}>{sendState.error}</span>
          ) : null}
        </div>
      ) : null}

      {previewOpen ? (
        <div className={styles.invoicePreviewDrawer}>
          <div className={styles.invoicePreviewHeader}>
            <strong style={{ fontSize: 13 }}>
              PDF Preview — Invoice #{activeInvoiceNumber}
            </strong>
            <div className={styles.invoiceActionButtons}>
              <a
                href={pdfPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
              >
                <IconEyePreview />
                <span>Open in new tab</span>
              </a>
              <a
                href={pdfDownloadUrl}
                className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
              >
                <IconDownloadPdf />
                <span>Download PDF</span>
              </a>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className={`${styles.invoiceBtn} ${styles.invoiceBtnSecondary}`}
              >
                <span>Close</span>
              </button>
            </div>
          </div>
          <iframe
            src={pdfPreviewUrl}
            title={`Invoice #${activeInvoiceNumber} PDF Preview`}
            style={{ width: "100%", height: 540, border: 0, display: "block" }}
          />
        </div>
      ) : null}
    </div>
  );
}
