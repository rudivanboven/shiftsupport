import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Kit";
import { formatMoney } from "@/lib/format";
import type { Bucket, DateRange } from "@/lib/admin/dates";
import styles from "./Admin.module.css";

/** Cents from the database, rendered as money. */
export const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : formatMoney(Math.round(cents) / 100);

/** Hours with at most two decimals, e.g. "6.5 h". */
export const hours = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Number(value).toFixed(2).replace(/\.?0+$/, "")} h`;

/* ------------------------------------------------------------ query strings */

export type Params = Record<string, string | undefined>;

/** Builds `path?…` from the current params with overrides; empty values drop. */
export function hrefWith(path: string, params: Params, overrides: Params = {}) {
  const merged = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/* ------------------------------------------------------------ metrics */

/** The category tints. Very light washes, one per dashboard section. */
export type SectionTone = "workers" | "retailers" | "shifts" | "applications" | "finance" | "neutral";

const TONE_CLASS: Record<SectionTone, string> = {
  workers: styles.toneWorkers,
  retailers: styles.toneRetailers,
  shifts: styles.toneShifts,
  applications: styles.toneApplications,
  finance: styles.toneFinance,
  neutral: styles.toneNeutral,
};

/**
 * One major dashboard section: a tinted, generously padded container with a
 * heading, an optional subtitle, and its directory link aligned right — so each
 * category reads as its own group instead of another run of white cards.
 */
export function Section({
  title,
  subtitle,
  link,
  tone = "neutral",
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  tone?: SectionTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.section} ${TONE_CLASS[tone]}`}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadText}>
          <div className={styles.sectionTitleRow}>
            {icon ? (
              <span className={styles.sectionIcon} aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <h3 className={styles.sectionTitle}>{title}</h3>
          </div>
          {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
        </div>
        {link ? (
          <Link className={styles.sectionLink} href={link.href}>
            {link.label} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The metric grid. With a `tone` it also draws the section container, which is
 * what the directory pages use to separate their summary from the filter bar
 * below without needing a heading.
 */
export const Metrics = ({ children, tone }: { children: ReactNode; tone?: SectionTone }) =>
  tone ? (
    <div className={`${styles.metricsPanel} ${TONE_CLASS[tone]}`}>
      <div className={styles.metrics}>{children}</div>
    </div>
  ) : (
    <div className={styles.metrics}>{children}</div>
  );

export function Metric({
  label,
  value,
  hint,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <>
      <span className={styles.metricTop}>
        {icon ? (
          <span className={styles.metricIcon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className={styles.metricLabel}>{label}</span>
      </span>
      <span className={styles.metricValue}>{value}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={styles.metric}>
      {body}
    </Link>
  ) : (
    <div className={styles.metric}>{body}</div>
  );
}

/* ------------------------------------------------------------ range filter */

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

/**
 * Today / 7 days / 30 days presets plus a custom from–to form. Plain links and
 * a GET form, so it works without client JavaScript. `extra` renders further
 * filter controls inside the same form.
 */
export function RangeFilter({
  path,
  params,
  range,
  allowAll = false,
  extra,
  hidden = [],
}: {
  path: string;
  params: Params;
  range: DateRange;
  allowAll?: boolean;
  extra?: ReactNode;
  hidden?: string[];
}) {
  const presets = allowAll ? [{ key: "all", label: "All time" }, ...PRESETS] : PRESETS;
  return (
    <>
      <form className={styles.filters} method="get" action={path}>
        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Period</span>
          <div className={styles.presets}>
            {presets.map((p) => (
              <Link
                key={p.key}
                href={hrefWith(path, params, { range: p.key, from: undefined, to: undefined, page: undefined })}
                className={`${styles.preset} ${range.key === p.key ? styles.presetActive : ""}`}
                aria-current={range.key === p.key ? "true" : undefined}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <input type="hidden" name="range" value="custom" />
        {hidden.map((key) =>
          params[key] ? <input key={key} type="hidden" name={key} value={params[key]} /> : null,
        )}

        <div className={styles.filterField}>
          <label htmlFor="range-from">From</label>
          <input id="range-from" className={styles.control} type="date" name="from" defaultValue={range.key === "custom" ? range.from ?? "" : ""} />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="range-to">To</label>
          <input id="range-to" className={styles.control} type="date" name="to" defaultValue={range.key === "custom" ? range.to ?? "" : ""} />
        </div>

        {extra}

        <button type="submit" className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`}>
          Apply
        </button>
      </form>
      {range.error ? <p className={styles.filterNote}>{range.error} Showing {range.label.toLowerCase()} instead.</p> : null}
    </>
  );
}

/** Non-date filter bar (search + selects), also a plain GET form. */
export function FilterBar({ path, children, keep = {} }: { path: string; children: ReactNode; keep?: Params }) {
  return (
    <form className={styles.filters} method="get" action={path}>
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
      <button type="submit" className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`}>
        Apply
      </button>
      <Link href={path} className={`${styles.contactBtn} ${styles.actionBtn}`}>
        Reset
      </Link>
    </form>
  );
}

export function SelectFilter({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${name}`;
  return (
    <div className={styles.filterField}>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""} className={styles.control}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilter({ value, placeholder }: { value?: string; placeholder: string }) {
  return (
    <div className={`${styles.filterField} ${styles.search}`}>
      <label htmlFor="filter-q">Search</label>
      <input id="filter-q" name="q" type="search" defaultValue={value ?? ""} placeholder={placeholder} className={styles.control} maxLength={100} />
    </div>
  );
}

/* ------------------------------------------------------------ table helpers */

export function SortHeader({
  path,
  params,
  column,
  label,
  numeric,
}: {
  path: string;
  params: Params;
  column: string;
  label: string;
  numeric?: boolean;
}) {
  const active = params.sort === column;
  const dir = active && params.dir === "asc" ? "desc" : "asc";
  return (
    <th className={numeric ? styles.num : undefined} aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link className={styles.sortLink} href={hrefWith(path, params, { sort: column, dir, page: undefined })}>
        {label}
        {active ? <span aria-hidden="true">{params.dir === "asc" ? "↑" : "↓"}</span> : null}
      </Link>
    </th>
  );
}

export function Pagination({ path, params, page, pageCount, total }: { path: string; params: Params; page: number; pageCount: number; total: number }) {
  return (
    <div className={styles.pagination}>
      <span>
        {total} result{total === 1 ? "" : "s"} · page {page} of {Math.max(pageCount, 1)}
      </span>
      <span className={styles.pageLinks}>
        <Link className={`${styles.pageLink} ${page <= 1 ? styles.pageLinkDisabled : ""}`} href={hrefWith(path, params, { page: String(page - 1) })} aria-disabled={page <= 1}>
          ← Previous
        </Link>
        <Link className={`${styles.pageLink} ${page >= pageCount ? styles.pageLinkDisabled : ""}`} href={hrefWith(path, params, { page: String(page + 1) })} aria-disabled={page >= pageCount}>
          Next →
        </Link>
      </span>
    </div>
  );
}

export function paginate<T>(rows: T[], pageParam: string | undefined, size: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1));
  return { page, pageCount, rows: rows.slice((page - 1) * size, page * size) };
}

export function sortRows<T>(rows: T[], dir: string | undefined, value: (row: T) => string | number | null | undefined) {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (va < vb ? -1 : 1) * factor;
  });
}

/** Lower-cased, trimmed search text, or "" when absent. */
export const searchText = (q: string | undefined) => (q ?? "").trim().toLowerCase().slice(0, 100);

export const matchesSearch = (q: string, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q));

/* ------------------------------------------------------------ status badges */

export const StatusBadge = ({ tone, children }: { tone: BadgeTone; children: ReactNode }) => <Badge tone={tone}>{children}</Badge>;

export function Notice({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
  return <div className={`${styles.notice} ${tone === "info" ? styles.noticeInfo : ""}`}>{children}</div>;
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={styles.kv}>
      {items.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------ chart */

/**
 * One series of counts (or amounts) over time as thin bars. Every bar carries
 * a native tooltip, and the same numbers are available as a table for screen
 * readers, so the chart is never the only way to read a value.
 */
export function BarTrend({
  title,
  buckets,
  format = (v) => String(v),
}: {
  title: string;
  buckets: Bucket[];
  format?: (value: number) => string;
}) {
  const width = 600;
  const height = 120;
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const total = buckets.reduce((sum, b) => sum + b.value, 0);
  const slot = width / Math.max(buckets.length, 1);
  const barWidth = Math.max(2, Math.min(28, slot - 2));

  return (
    <figure className={styles.chartCard} style={{ margin: 0 }}>
      <figcaption className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.chartTotal}>{format(total)}</span>
      </figcaption>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title}: ${format(total)} in total`}>
        <line className={styles.chartGrid} x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} vectorEffect="non-scaling-stroke" />
        <line className={styles.chartGrid} x1="0" x2={width} y1={0.5} y2={0.5} vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
        {buckets.map((b, i) => {
          const h = b.value ? Math.max(3, (b.value / max) * (height - 6)) : 0;
          const x = i * slot + (slot - barWidth) / 2;
          return (
            <g key={b.key} className={styles.barGroup}>
              <title>{`${b.label}: ${format(b.value)}`}</title>
              <rect className={styles.barHit} x={i * slot} y={0} width={slot} height={height} />
              {h ? <rect className={styles.bar} x={x} y={height - h} width={barWidth} height={h} rx={Math.min(3, barWidth / 2)} /> : null}
            </g>
          );
        })}
      </svg>
      <div className={styles.chartAxis} aria-hidden="true">
        <span>{buckets[0]?.key ?? ""}</span>
        <span>peak {format(max === 1 && total === 0 ? 0 : max)}</span>
        <span>{buckets[buckets.length - 1]?.key ?? ""}</span>
      </div>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{format(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
