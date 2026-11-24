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
import { WORKER_HOURLY_RATE } from "@/lib/pricing";
import { clockTime, describeDays } from "@/lib/recurrence";
import type { SeriesInfo, Shift, StoreContact } from "@/lib/supabase/types";
import styles from "./ShiftCard.module.css";

export const ShiftGrid = ({
  children,
  fullWidth = false,
}: {
  children: ReactNode;
  fullWidth?: boolean;
}) => (
  <div className={`${styles.grid} ${fullWidth ? styles.gridFullWidth : ""}`}>
    {children}
  </div>
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
  draft: "Awaiting payment",
  open: "Open",
  filled: "Filled",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const SHIFT_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "pending",
  open: "open",
  filled: "filled",
  cancelled: "cancelled",
  completed: "neutral",
};

interface ShiftCardProps {
  shift: Shift;
  /** Controls which role-specific rate and earnings language the card displays. */
  perspective?: "retailer" | "worker";
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
  /**
   * The recurring series this date belongs to (migration 0012). Omitted:
   * nothing is shown, as before. `null`: a one-time shift — labelled as such
   * on worker cards so the two are easy to tell apart.
   */
  series?: SeriesInfo | null;
  /**
   * When true, renders the card in a full-width single-column vertical layout
   * with every information field stacked one row below another (used on the
   * Retailer "My Shifts" management dashboard).
   */
  fullWidth?: boolean;
}

export default function ShiftCard({
  shift,
  perspective = "retailer",
  storeName,
  storeAddress,
  badge,
  applicantCount,
  note,
  contact,
  actions,
  footer,
  accent = "green",
  series,
  fullWidth = false,
}: ShiftCardProps) {
  const status = shift.status ?? "open";
  const resolvedBadge = badge ?? {
    tone: SHIFT_STATUS_TONE[status] ?? "neutral",
    label: SHIFT_STATUS_LABEL[status] ?? status,
  };

  const workerView = perspective === "worker";
  const displayedRate = workerView ? WORKER_HOURLY_RATE : shift.hourly_rate;
  const pay = totalPay(displayedRate, shift.duration);
  const location = shift.shift_location ?? storeAddress ?? contact?.store_address;
  const accentClass =
    accent === "muted"
      ? styles.accentMuted
      : accent === "peach"
        ? styles.accentPeach
        : "";

  return (
    <article className={`${styles.card} ${fullWidth ? styles.cardFullWidth : ""}`}>
      <div className={`${styles.accent} ${accentClass}`} />

      <div className={`${styles.head} ${fullWidth ? styles.headFullWidth : ""}`}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{shift.task_type}</h3>
          {storeName ? (
            <p className={styles.store}>
              <IconStore width={14} height={14} />
              {storeName}
            </p>
          ) : null}
          {fullWidth && shift.description ? (
            <p className={styles.descriptionFullWidth}>{shift.description}</p>
          ) : null}
        </div>
        <Badge tone={resolvedBadge.tone}>{resolvedBadge.label}</Badge>
      </div>

      {series ? (
        <p className={styles.recurrence}>
          <span className={styles.recurrenceTag}>Recurring shift</span>
          <span className={styles.recurrenceText}>
            {describeDays(series.days_of_week)} · {clockTime(series.start_time)} –{" "}
            {clockTime(series.end_time)}
          </span>
        </p>
      ) : series === null && workerView ? (
        <p className={styles.recurrence}>
          <span className={`${styles.recurrenceTag} ${styles.oneTimeTag}`}>One-time shift</span>
        </p>
      ) : null}

      {!fullWidth && shift.description ? (
        <p className={styles.description}>{shift.description}</p>
      ) : null}

      {location ? (
        <div className={`${styles.location} ${fullWidth ? styles.locationFullWidth : ""}`}>
          <IconPin width={17} height={17} />
          <span className={styles.locationBody}>
            <span className={styles.locationLabel}>Shift location</span>
            <span className={styles.locationValue}>{location}</span>
          </span>
        </div>
      ) : null}

      <div className={`${styles.meta} ${fullWidth ? styles.metaVertical : ""}`}>
        <div className={`${styles.metaCell} ${fullWidth ? styles.metaRowVertical : ""}`}>
          <span className={styles.metaCellLabelWrap}>
            <IconCalendar width={16} height={16} className={styles.metaIcon} />
            <span className={styles.metaLabel}>Date</span>
          </span>
          <span className={styles.metaValue}>{formatDate(shift.start_time)}</span>
        </div>

        <div className={`${styles.metaCell} ${fullWidth ? styles.metaRowVertical : ""}`}>
          <span className={styles.metaCellLabelWrap}>
            <IconClock width={16} height={16} className={styles.metaIcon} />
            <span className={styles.metaLabel}>Time</span>
          </span>
          <span className={styles.metaValue}>
            {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
          </span>
        </div>

        <div className={`${styles.metaCell} ${fullWidth ? styles.metaRowVertical : ""}`}>
          <span className={styles.metaCellLabelWrap}>
            <IconClock width={16} height={16} className={styles.metaIcon} />
            <span className={styles.metaLabel}>Duration</span>
          </span>
          <span className={styles.metaValue}>{formatDuration(shift.duration)}</span>
        </div>

        <div className={`${styles.metaCell} ${fullWidth ? styles.metaRowVertical : ""}`}>
          <span className={styles.metaCellLabelWrap}>
            <IconCash width={16} height={16} className={styles.metaIcon} />
            <span className={styles.metaLabel}>{workerView ? "Gross rate" : "Hourly rate"}</span>
          </span>
          <span className={styles.metaValue}>{formatRate(displayedRate)}</span>
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

      <div className={`${styles.foot} ${fullWidth ? styles.footFullWidth : ""}`}>
        <div className={`${styles.total} ${fullWidth ? styles.totalFullWidth : ""}`}>
          <span className={styles.totalIcon} aria-hidden="true">
            {currencySymbol()}
          </span>
          <span className={styles.totalText}>
            <span className={styles.totalValue}>
              {pay === null ? "—" : formatMoney(pay)}
            </span>
            <span className={styles.totalLabel}>
              {pay === null
                ? "Rate to be confirmed"
                : workerView
                  ? "Estimated gross"
                  : "Estimated total for the shift"}
            </span>
          </span>
        </div>

        {fullWidth ? (
          <>
            {applicantCount ? (
              <div className={styles.infoRowFullWidth}>
                <span className={styles.infoRowLabel}>
                  <IconUsers width={16} height={16} className={styles.metaIcon} />
                  <span>Applicants</span>
                </span>
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
              </div>
            ) : null}

            {actions ? (
              <div className={styles.actionsRowFullWidth}>
                <span className={styles.infoRowLabel}>Quick views</span>
                <div className={styles.actionsGroupFullWidth}>{actions}</div>
              </div>
            ) : null}
          </>
        ) : applicantCount || actions ? (
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
