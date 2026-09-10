import { initialsOf } from "@/lib/format";
import styles from "./DashboardUserStrip.module.css";

/**
 * Compact account status strip for the top of a dashboard's content area.
 *
 * Presentational only — the caller passes the already-resolved name and role,
 * which keeps the single role resolver (`getCurrentUserWithRole`) the only
 * thing that decides who anyone is.
 */
export default function DashboardUserStrip({
  name,
  role,
  dashboardHref,
}: {
  name: string;
  role: "Worker" | "Retailer";
  dashboardHref: string;
}) {
  return (
    <div className={styles.strip}>
      <span className={styles.avatar} aria-hidden="true">
        {initialsOf(name)}
      </span>

      <div className={styles.copy}>
        <p className={styles.name}>Hi, {name}</p>
        <p className={styles.role}>{role} account</p>
      </div>

      <a className={styles.link} href={dashboardHref}>
        Dashboard
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
      </a>
    </div>
  );
}
