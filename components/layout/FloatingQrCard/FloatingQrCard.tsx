"use client";

import { useState } from "react";
import styles from "./FloatingQrCard.module.css";

export default function FloatingQrCard() {
  const [expanded, setExpanded] = useState(true);

  if (!expanded) {
    return (
      <button
        className={styles.reopen}
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Show ShiftSupport QR code"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM18 14h2v4h-2zM14 18h4v2h-4z" />
        </svg>
        <span>Scan QR to open on mobile</span>
      </button>
    );
  }

  return (
    <aside className={styles.card} aria-label="ShiftSupport QR code">
      <button
        className={styles.close}
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Dismiss ShiftSupport QR code"
      >
        <span aria-hidden="true">×</span>
      </button>

      <a
        className={styles.qrLink}
        href="https://shiftsupport.net"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open ShiftSupport website in a new tab"
      >
        <img
          src="/images/qrcode.png"
          alt="QR code for the ShiftSupport website"
          width={370}
          height={370}
        />
      </a>

      <h2>Scan to visit ShiftSupport</h2>
      <p>Scan with your phone to open our website.</p>
    </aside>
  );
}
