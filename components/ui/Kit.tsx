import type { ReactNode } from "react";
import { IconArrow, IconInbox } from "@/components/dashboard/Icons";
import styles from "./Kit.module.css";

/* ------------------------------------------------ page header */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h2 className={styles.pageTitle}>{title}</h2>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------ welcome banner */

export function WelcomeBanner({
  badge,
  title,
  text,
  actions,
}: {
  badge: string;
  title: string;
  text: string;
  actions?: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <section className={styles.welcome}>
      <div className={styles.welcomeInner}>
        <div className={styles.welcomeText}>
          <span className={styles.welcomeBadge}>{badge}</span>
          <h2 className={styles.welcomeTitle}>{title}</h2>
          <p>{text}</p>
        </div>

        {actions?.length ? (
          <div className={styles.welcomeActions}>
            {actions.map((action) => (
              <a
                key={action.href}
                href={action.href}
                className={`${styles.welcomeButton} ${
                  action.primary
                    ? styles.welcomeButtonPrimary
                    : styles.welcomeButtonGhost
                }`}
              >
                {action.label}
                <IconArrow width={16} height={16} />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------ stats */

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <div className={styles.statGrid}>{children}</div>
);

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "green",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: ReactNode;
  tone?: "green" | "lime" | "peach" | "neutral";
}) {
  const toneClass =
    tone === "lime"
      ? styles.statIconLime
      : tone === "peach"
        ? styles.statIconPeach
        : tone === "neutral"
          ? styles.statIconNeutral
          : "";

  return (
    <article className={styles.stat}>
      <div className={styles.statTop}>
        <span className={`${styles.statIcon} ${toneClass}`}>{icon}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <span className={styles.statValue}>{value}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </article>
  );
}

/* ------------------------------------------------ panel */

export function Panel({
  title,
  description,
  action,
  children,
  flush = false,
}: {
  title?: string;
  description?: string;
  action?: { href: string; label: string };
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={styles.panel}>
      {title ? (
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <h3 className={styles.panelTitle}>{title}</h3>
            {description ? <p className={styles.panelDescription}>{description}</p> : null}
          </div>
          {action ? (
            <a className={styles.panelAction} href={action.href}>
              {action.label}
              <IconArrow width={15} height={15} />
            </a>
          ) : null}
        </div>
      ) : null}
      <div className={`${styles.panelBody} ${flush ? styles.panelFlush : ""}`}>
        {children}
      </div>
    </section>
  );
}

export const Columns = ({ children }: { children: ReactNode }) => (
  <div className={styles.columns}>{children}</div>
);

export const Stack = ({ children }: { children: ReactNode }) => (
  <div className={styles.stack}>{children}</div>
);

/* ------------------------------------------------ badge */

export type BadgeTone =
  | "open"
  | "pending"
  | "approved"
  | "rejected"
  | "filled"
  | "cancelled"
  | "neutral";

const BADGE_CLASS: Record<BadgeTone, string> = {
  open: styles.badgeOpen,
  pending: styles.badgePending,
  approved: styles.badgeApproved,
  rejected: styles.badgeRejected,
  filled: styles.badgeFilled,
  cancelled: styles.badgeCancelled,
  neutral: styles.badgeNeutral,
};

export const Badge = ({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) => <span className={`${styles.badge} ${BADGE_CLASS[tone]}`}>{children}</span>;

/* ------------------------------------------------ states */

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <span className={styles.stateIcon}>{icon ?? <IconInbox width={22} height={22} />}</span>
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateText}>{text}</p>
      {action ? <div className={styles.stateAction}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this",
  text,
  action,
}: {
  title?: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <span className={`${styles.stateIcon} ${styles.stateIconError}`}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="9.2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 6.4v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="11" cy="15.2" r="1" fill="currentColor" />
        </svg>
      </span>
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateText}>{text}</p>
      {action ? <div className={styles.stateAction}>{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------ skeleton */

export const Skeleton = ({
  height = 16,
  width = "100%",
  radius = 12,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
}) => (
  <span
    className={styles.skeleton}
    style={{ display: "block", height, width, borderRadius: radius }}
    aria-hidden="true"
  />
);

/* ------------------------------------------------ meta rows */

export const MetaList = ({ children }: { children: ReactNode }) => (
  <div className={styles.metaList}>{children}</div>
);

export function MetaRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaIcon}>{icon}</span>
      <span>
        <span className={styles.metaLabel}>{label}</span>
        <span className={styles.metaValue}>{value}</span>
      </span>
    </div>
  );
}
