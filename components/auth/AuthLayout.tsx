import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  badge: string;
  asideTitle: string;
  asideText: string;
  points: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

const Tick = () => (
  <span className={styles.tick} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6.3 4.8 8.6 9.5 3.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export default function AuthLayout({
  badge,
  asideTitle,
  asideText,
  points,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.aside}>
        <div className={styles.asideTop}>
          <a href="/" className={styles.logo} aria-label="ShiftSupport — home">
            <img src="/images/whitelogo.png" alt="ShiftSupport" />
          </a>
        </div>

        <div className={styles.asideBody}>
          <span className={styles.badge}>{badge}</span>
          <h2 className={styles.asideTitle}>{asideTitle}</h2>
          <p className={styles.asideText}>{asideText}</p>
          <ul className={styles.points}>
            {points.map((point) => (
              <li key={point}>
                <Tick />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.asideFoot}>
          <a href="/">← Back to shiftsupport.com</a>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.card}>
          <a href="/" className={styles.mobileLogo} aria-label="ShiftSupport — home">
            <img src="/images/logobalck.png" alt="ShiftSupport" />
          </a>

          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>

          <div className={styles.body}>{children}</div>

          {footer ? <div className={styles.switch}>{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
