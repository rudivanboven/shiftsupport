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

export function GenerateOrManageInvoiceActions({
  shiftId,
  eligible,
  ineligibleReason,
  existingInvoice,
  autoPreviewOnGenerate = true,
  compact = false,
}: {
  shiftId: string;
  eligible: boolean;
  ineligibleReason?: string;
  existingInvoice?: InvoiceActionSummary | null;
  autoPreviewOnGenerate?: boolean;
  compact?: boolean;
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
            className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`}
          >
            {genPending ? "Generating PDF…" : "Generate Invoice"}
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
      <div className={styles.contactBar}>
        <Link
          href={detailUrl}
          className={`${styles.contactBtn} ${styles.actionBtn}`}
        >
          View Invoice
        </Link>
        {!compact ? (
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className={`${styles.contactBtn} ${styles.actionBtn}`}
          >
            {previewOpen ? "Hide Preview" : "Preview PDF"}
          </button>
        ) : null}
        <a
          href={pdfDownloadUrl}
          className={`${styles.contactBtn} ${styles.actionBtn}`}
        >
          Download PDF
        </a>
        <form action={sendAction} style={{ display: "inline" }}>
          <input type="hidden" name="invoiceId" value={activeInvoiceId} />
          <button
            type="submit"
            disabled={sendPending}
            className={`${styles.contactBtn} ${styles.actionBtn} ${
              alreadySent ? "" : styles.actionBtnPrimary
            }`}
          >
            {sendPending
              ? "Sending…"
              : alreadySent
                ? "Resend Email"
                : "Send Email"}
          </button>
        </form>
      </div>

      {genState.success ? (
        <span className={styles.sub}>{genState.success}</span>
      ) : null}
      {sendState.success ? (
        <span className={styles.sub}>{sendState.success}</span>
      ) : null}
      {sendState.error ? (
        <span className={`${styles.sub} ${styles.warnText}`}>
          {sendState.error}
        </span>
      ) : null}

      {previewOpen ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(22, 48, 36, 0.16)",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid rgba(22, 48, 36, 0.12)",
              background: "#f4f0e8",
            }}
          >
            <strong style={{ fontSize: 13 }}>
              PDF Preview — Invoice #{activeInvoiceNumber}
            </strong>
            <div className={styles.contactBar}>
              <a
                href={pdfPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.contactBtn}
              >
                Open in new tab
              </a>
              <a href={pdfDownloadUrl} className={styles.contactBtn}>
                Download PDF
              </a>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className={styles.contactBtn}
              >
                Close
              </button>
            </div>
          </div>
          <iframe
            src={pdfPreviewUrl}
            title={`Invoice #${activeInvoiceNumber} PDF Preview`}
            style={{ width: "100%", height: 520, border: 0, display: "block" }}
          />
        </div>
      ) : null}
    </div>
  );
}
