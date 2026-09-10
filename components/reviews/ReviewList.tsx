import { formatDate } from "@/lib/format";
import type { StoreReviewEntry, WorkerReviewEntry } from "@/lib/supabase/types";
import { Stars } from "./Stars";
import styles from "./Review.module.css";

type Entry = WorkerReviewEntry | StoreReviewEntry;

const counterparty = (entry: Entry) =>
  "store_name" in entry ? entry.store_name : (entry.worker_name ?? "A worker");

/**
 * Per-job review history.
 *
 * Each row is one completed shift: what the job was, who the other side was,
 * when it ran, the stars and the comment. Only the reviewer's *side* is named
 * — never their contact details.
 */
export default function ReviewList({
  reviews,
  emptyText,
}: {
  reviews: Entry[];
  emptyText: string;
}) {
  if (reviews.length === 0) {
    return <p className={styles.itemMeta}>{emptyText}</p>;
  }

  return (
    <div className={styles.list}>
      {reviews.map((entry) => {
        const byRetailer = "store_name" in entry;

        return (
          <article className={styles.item} key={entry.id}>
            <div className={styles.itemHead}>
              <div>
                <h4 className={styles.itemTitle}>{entry.task_type}</h4>
                <p className={styles.itemMeta}>
                  {counterparty(entry)} · {formatDate(entry.shift_date)}
                </p>
              </div>

              <span className={styles.itemStars}>
                <Stars value={entry.rating} />
                <span className={styles.itemScore}>{entry.rating}/5</span>
              </span>
            </div>

            {entry.comment ? (
              <p className={styles.itemComment}>&ldquo;{entry.comment}&rdquo;</p>
            ) : null}

            <p className={styles.itemBy}>
              Reviewed by {byRetailer ? "the retailer" : "the worker"} ·{" "}
              {formatDate(entry.created_at)}
            </p>
          </article>
        );
      })}
    </div>
  );
}
