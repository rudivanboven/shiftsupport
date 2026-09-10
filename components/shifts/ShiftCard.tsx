import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Kit";
import {
  IconCalendar,
  IconCash,
  IconCheck,
  IconClock,
  IconPhone,
  IconPin,
  IconStore,
  IconUsers,
} from "@/components/dashboard/Icons";
import {
  currencySymbol,
  formatDate,
  formatDuration,
  formatMoney,
  formatRate,
  formatTime,
  totalPay,
} from "@/lib/format";
import type { Shift, StoreContact } from "@/lib/supabase/types";
import styles from "./ShiftCard.module.css";

export const ShiftGrid = ({ children }: { children: ReactNode }) => (
  <div className={styles.grid}>{children}</div>
);

function NoticeIcon() {
  return (
    <svg
      className={styles.noteIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.9v4.6" />
      <path d="M12 15.8h.01" />
    </svg>
  );
}

export const SHIFT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const SHIFT_STATUS_TONE: Record<string, BadgeTone> = {
  open: "open",
  filled: "filled",
  cancelled: "cancelled",
  completed: "neutral",
};

interface ShiftCardProps {
  shift: Shift;
  storeName?: string | null;
  storeAddress?: string | null;
  badge?: { tone: BadgeTone; label: string };
  applicantCount?: { pending: number; total: number };
  note?: {
    text: string;
    hired?: boolean;
    /** "warning" is the soft not-selected notice, not an error. */
    tone?: "warning";
  };
  contact?: StoreContact | null;
  actions?: ReactNode;
  /** Rendered as the last block in the card — used for the review state. */
  footer?: ReactNode;
  accent?: "green" | "muted" | "peach";
}

export default function ShiftCard({
  shift,
  storeName,
  storeAddress,
  badge,
  applicantCount,
  note,
  contact,
  actions,
  footer,
  accent = "green",
}: ShiftCardProps) {
  const status = shift.status ?? "open";
  const resolvedBadge = badge ?? {
    tone: SHIFT_STATUS_TONE[status] ?? "neutral",
    label: SHIFT_STATUS_LABEL[status] ?? status,
  };

  const pay = totalPay(shift.hourly_rate, shift.duration);
  const location = shift.shift_location ?? storeAddress ?? contact?.store_address;
  const accentClass =
    accent === "muted"
      ? styles.accentMuted
      : accent === "peach"
        ? styles.accentPeach
        : "";

  return (
    <article className={styles.card}>
      <div className={`${styles.accent} ${accentClass}`} />

      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{shift.task_type}</h3>
          {storeName ? (
            <p className={styles.store}>
              <IconStore width={14} height={14} />
              {storeName}
            </p>
          ) : null}
        </div>
        <Badge tone={resolvedBadge.tone}>{resolvedBadge.label}</Badge>
      </div>

      {shift.description ? (
        <p className={styles.description}>{shift.description}</p>
      ) : null}

      {location ? (
        <div className={styles.location}>
          <IconPin width={17} height={17} />
          <span>
            <span className={styles.locationLabel}>Shift location</span>
            <span className={styles.locationValue}>{location}</span>
          </span>
        </div>
      ) : null}

      <div className={styles.meta}>
        <div className={styles.metaCell}>
          <IconCalendar width={16} height={16} className={styles.metaIcon} />
          <span>
            <span className={styles.metaLabel}>Date</span>
            <span className={styles.metaValue}>{formatDate(shift.start_time)}</span>
          </span>
        </div>

        <div className={styles.metaCell}>
          <IconClock width={16} height={16} className={styles.metaIcon} />
          <span>
            <span className={styles.metaLabel}>Time</span>
            <span className={styles.metaValue}>
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
            </span>
          </span>
        </div>

        <div className={styles.metaCell}>
          <IconPin width={16} height={16} className={styles.metaIcon} />
          <span>
            <span className={styles.metaLabel}>Duration</span>
            <span className={styles.metaValue}>{formatDuration(shift.duration)}</span>
          </span>
        </div>

        <div className={styles.metaCell}>
          <IconCash width={16} height={16} className={styles.metaIcon} />
          <span>
            <span className={styles.metaLabel}>Rate</span>
            <span className={styles.metaValue}>{formatRate(shift.hourly_rate)}</span>
          </span>
        </div>
      </div>

      {note ? (
        <div
          className={`${styles.note} ${note.hired ? styles.noteHired : ""} ${
            note.tone === "warning" ? styles.noteWarning : ""
          }`}
        >
          {note.tone === "warning" ? <NoticeIcon /> : null}
          <p className={styles.noteText}>{note.text}</p>
        </div>
      ) : null}

      {contact ? (
        <div className={styles.contact}>
          <p className={styles.contactTitle}>
            <IconCheck width={14} height={14} />
            Your store contact
          </p>
          <div className={styles.contactRow}>
            <span>Store</span>
            <span>{contact.store_name}</span>
          </div>
          {contact.store_address ? (
            <div className={styles.contactRow}>
              <span>Address</span>
              <span>{contact.store_address}</span>
            </div>
          ) : null}
          <div className={styles.contactRow}>
            <span>Phone</span>
            <span>
              {contact.contact_phone ? (
                <a href={`tel:${contact.contact_phone.replace(/\s/g, "")}`}>
                  <IconPhone
                    width={13}
                    height={13}
                    style={{ verticalAlign: "-2px", marginRight: 5 }}
                  />
                  {contact.contact_phone}
                </a>
              ) : (
                "Not provided — ask when you arrive"
              )}
            </span>
          </div>
        </div>
      ) : null}

      <div className={styles.foot}>
        <div className={styles.total}>
          <span className={styles.totalIcon} aria-hidden="true">
            {currencySymbol()}
          </span>
          <span className={styles.totalText}>
            <span className={styles.totalValue}>
              {pay === null ? "—" : formatMoney(pay)}
            </span>
            <span className={styles.totalLabel}>
              {pay === null ? "Rate to be confirmed" : "Estimated total for the shift"}
            </span>
          </span>
        </div>

        {applicantCount || actions ? (
          <div className={styles.footRow}>
            {applicantCount ? (
              <span
                className={`${styles.applicants} ${
                  applicantCount.pending > 0 ? styles.applicantsHot : ""
                }`}
              >
                <IconUsers width={14} height={14} />
                {applicantCount.total === 0
                  ? "No applicants"
                  : `${applicantCount.total} applicant${applicantCount.total === 1 ? "" : "s"}`}
                {applicantCount.pending > 0 ? ` · ${applicantCount.pending} new` : ""}
              </span>
            ) : null}

            {actions ? <div className={styles.footActions}>{actions}</div> : null}
          </div>
        ) : null}
      </div>

      {footer}
    </article>
  );
}
