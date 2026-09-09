import Link from "next/link";
import styles from "./Tabs.module.css";

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export default function Tabs({
  items,
  active,
  label,
}: {
  items: TabItem[];
  active: string;
  label: string;
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`${styles.tab} ${item.key === active ? styles.tabActive : ""}`}
          aria-current={item.key === active ? "page" : undefined}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className={styles.tabCount}>{item.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
