"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { recordMailClientHandoff, sendAdminEmail, type EmailActionState } from "@/app/actions/super-admin";
import { Alert, FormGrid, Input, SubmitButton, Textarea } from "@/components/ui/Form";
import { IconClose } from "@/components/dashboard/Icons";
import styles from "./Admin.module.css";

export interface ContactTarget {
  type: "worker" | "retailer";
  id: string;
  name: string;
  email: string | null;
  telHref: string | null;
  whatsappHref: string | null;
}

const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="2.8" y="4.6" width="14.4" height="10.8" rx="2" />
    <path d="m3.4 6 6.6 4.6L16.6 6" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.2 3.4 8 3.9l1 3-1.7 1.3a9.4 9.4 0 0 0 4.5 4.5l1.3-1.7 3 1 .5 1.8a1.5 1.5 0 0 1-1.5 1.9A13.3 13.3 0 0 1 4.3 4.9a1.5 1.5 0 0 1 1.9-1.5Z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.6 16.4 4.7 13a6.6 6.6 0 1 1 2.5 2.4Z" />
    <path d="M7.9 7.6c.3 1.9 2.1 3.6 4 3.9l.8-1.2 1.4.6-.2 1.3c-2.6.5-5.9-2.4-6.3-5.2l1.2-.3.7 1.4Z" />
  </svg>
);

/**
 * Email / Call / WhatsApp for one worker or retailer.
 *
 * The links are built on the server from the saved phone number; the email
 * composer posts to a server action which resolves the recipient address from
 * the database again, so the browser cannot redirect a message elsewhere.
 */
export default function ContactActions({ target, subjectHint }: { target: ContactTarget; subjectHint?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={styles.contactRow}>
        <button
          type="button"
          className={`${styles.contactBtn} ${target.email ? "" : styles.contactBtnDisabled}`}
          onClick={() => target.email && setOpen(true)}
          disabled={!target.email}
          title={target.email ?? "No email address on file"}
        >
          <MailIcon />
          Email
        </button>

        {target.telHref ? (
          <a className={styles.contactBtn} href={target.telHref}>
            <PhoneIcon />
            Call
          </a>
        ) : (
          <span className={`${styles.contactBtn} ${styles.contactBtnDisabled}`} title="No phone number on file">
            <PhoneIcon />
            Call
          </span>
        )}

        {target.whatsappHref ? (
          <a className={styles.contactBtn} href={target.whatsappHref} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            WhatsApp
          </a>
        ) : (
          <span className={`${styles.contactBtn} ${styles.contactBtnDisabled}`} title="Phone number has no country code, so WhatsApp can't be opened">
            <WhatsAppIcon />
            WhatsApp
          </span>
        )}
      </div>

      {open && target.email ? (
        <EmailDialog target={target} subjectHint={subjectHint} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function EmailDialog({
  target,
  subjectHint,
  onClose,
}: {
  target: ContactTarget;
  subjectHint?: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState<EmailActionState, FormData>(sendAdminEmail, {});
  const dialogRef = useRef<HTMLDivElement>(null);
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openMailClient = async () => {
    const subject = dialogRef.current?.querySelector<HTMLInputElement>('input[name="subject"]')?.value ?? "";
    setHandedOff(true);
    await recordMailClientHandoff(target.type, target.id, subject);
    if (state.mailto) window.location.href = state.mailto;
  };

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="email-dialog-title" ref={dialogRef}>
        <div className={styles.dialogHead}>
          <h2 id="email-dialog-title">Send email</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className={styles.dialogBody}>
          <form action={action}>
            <input type="hidden" name="recipientType" value={target.type} />
            <input type="hidden" name="recipientId" value={target.id} />

            <FormGrid>
              {state.error ? <Alert tone="error">{state.error}</Alert> : null}
              {state.success ? <Alert tone="success">{state.success}</Alert> : null}

              <div>
                <span className={styles.filterLabel}>To</span>
                <p className={styles.readonly} style={{ marginTop: 6 }}>
                  {target.name} · {target.email}
                </p>
              </div>

              <Input
                label="Subject"
                name="subject"
                maxLength={200}
                required
                defaultValue={state.values?.subject ?? subjectHint ?? ""}
                error={state.fieldErrors?.subject}
              />

              <Textarea
                label="Message"
                name="message"
                rows={9}
                maxLength={10000}
                required
                defaultValue={state.values?.message ?? ""}
                error={state.fieldErrors?.message}
              />

              {state.outcome === "not_configured" && state.mailto ? (
                <button type="button" className={`${styles.contactBtn} ${styles.actionBtn}`} onClick={openMailClient}>
                  {handedOff ? "Opening your mail app…" : "Open in my mail app instead"}
                </button>
              ) : null}

              <SubmitButton pendingLabel="Sending…">Send email</SubmitButton>
            </FormGrid>
          </form>
        </div>
      </div>
    </div>
  );
}
