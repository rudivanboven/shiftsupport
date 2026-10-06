import { Badge, Panel } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";
import { formatDate } from "@/lib/format";
import { clockTime, describeDays } from "@/lib/recurrence";
import type { SeriesWithOccurrences } from "@/lib/data/series";
import { summariseSeries } from "./seriesSummary";
import styles from "./series.module.css";

/** The store's recurring series, above the list of individual dates. */
export default function SeriesOverview({ series }: { series: SeriesWithOccurrences[] }) {
  return (
    <div className={styles.overview}>
      <Panel
        title="Recurring shifts"
        description="Each series repeats every week and keeps the worker you hire. Its dates also appear in the list below."
      >
        <ul className={styles.overviewList}>
          {series.map((item) => {
            const summary = summariseSeries(item);
            return (
              <li key={item.id} className={styles.overviewRow}>
                <div className={styles.overviewMain}>
                  <p className={styles.overviewTitle}>
                    {item.task_type}
                    <Badge tone={item.status === "active" ? "open" : "neutral"}>
                      {item.status === "active" ? "Recurring" : "Recurring · ended"}
                    </Badge>
                  </p>
                  <p className={styles.overviewMeta}>
                    {describeDays(item.days_of_week)} · {clockTime(item.start_time)} –{" "}
                    {clockTime(item.end_time)}
                  </p>
                  <p className={styles.overviewMeta}>
                    {summary.upcoming.length} upcoming date
                    {summary.upcoming.length === 1 ? "" : "s"}
                    {summary.awaitingPayment.length
                      ? ` · ${summary.awaitingPayment.length} awaiting payment`
                      : ""}
                    {summary.next ? ` · next ${formatDate(summary.next.start_time)}` : ""}
                    {" · "}
                    {item.assigned_worker_id ? "Same worker kept" : "No worker hired yet"}
                  </p>
                </div>
                <a
                  className={buttonClass("ghost", { small: true })}
                  href={`/retailer/shifts/series/${item.id}`}
                >
                  Manage series
                </a>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
