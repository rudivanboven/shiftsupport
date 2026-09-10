import { formatDate } from "@/lib/format";
import type { ShiftReviewState } from "@/lib/supabase/types";
import { Stars } from "./Stars";
import ReviewDialog from "./ReviewDialog";
import CompleteShiftButton from "./CompleteShiftButton";
import styles from "./Review.module.css";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.4 10.5V8a3.6 3.6 0 0 1 7.2 0v2.5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
         strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.6l2.47 5.01 5.53.8-4 3.9.95 5.5L12 16.22l-4.95 2.6.95-5.5-4-3.9 5.53-.8z" />
    </svg>
  );
}

/** Whole days from now until `iso`, rounded up. Display only. */
function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/**
 * The review state of one shift, as shown on its card.
 *
 * Four things can be true, and the server decides which:
 *   - not completed yet   -> the retailer gets a "Mark completed" button
 *   - completed, waiting  -> a locked note saying when it opens
 *   - completed, open     -> the rate button
 *   - already reviewed    -> the stars they gave
 *
 * `state.can_review` comes from the database and is the only thing that
 * decides whether the button appears; the countdown text below is purely
 * cosmetic and is never what authorises a submission.
 */
export default function ShiftReviewBlock({
  state,
  subjectName,
  canComplete = false,
  shiftId,
}: {
  state: ShiftReviewState | undefined;
  /** The other party: the hired worker's name, or the store's name. */
  subjectName: string;
  /** True only for the retailer, on a finished shift not yet completed. */
  canComplete?: boolean;
  shiftId: string;
}) {
  // Not a participant, or nothing to say about this shift yet.
  if (!state) {
    if (!canComplete) return null;

    return (
      <div className={styles.block}>
        <span className={styles.blockIcon}>
          <StarIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>Did this shift go ahead?</p>
          <p className={styles.blockHint}>
            Confirm it to close the shift off and open reviews in 3 days.
          </p>
        </div>
        <span className={styles.blockAction}>
          <CompleteShiftButton shiftId={shiftId} />
        </span>
      </div>
    );
  }

  const isRetailer = state.viewer_role === "retailer";
  const subjectLabel = isRetailer ? "worker" : "store";

  // Already reviewed — show what they gave, permanently.
  if (state.my_rating !== null) {
    return (
      <div className={`${styles.block} ${styles.blockDone}`}>
        <span className={styles.blockIcon}>
          <StarIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>Review submitted</p>
          <span className={styles.given}>
            <Stars value={state.my_rating} />
            <span className={styles.blockHint}>{state.my_rating}/5</span>
          </span>
          {state.my_comment ? (
            <p className={styles.givenComment}>&ldquo;{state.my_comment}&rdquo;</p>
          ) : null}
        </div>
      </div>
    );
  }

  // Completed and the window is open.
  if (state.can_review) {
    return (
      <div className={styles.block}>
        <span className={styles.blockIcon}>
          <StarIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>
            Rate {isRetailer ? "this worker" : "this store"}
          </p>
          <p className={styles.blockHint}>
            The review window is open. It only takes a moment.
          </p>
        </div>
        <span className={styles.blockAction}>
          <ReviewDialog
            shiftId={state.shift_id}
            subjectName={subjectName}
            subjectLabel={subjectLabel}
            triggerLabel={isRetailer ? "Rate Worker" : "Rate Retailer"}
          />
        </span>
      </div>
    );
  }

  // Completed, but still inside the 3-day waiting period.
  if (state.shift_status === "completed" && state.review_opens_at) {
    const days = daysUntil(state.review_opens_at);

    return (
      <div className={styles.block}>
        <span className={styles.blockIcon}>
          <LockIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>
            {days === 0
              ? "Review unlocks today"
              : `Review available in ${days} day${days === 1 ? "" : "s"}`}
          </p>
          <p className={styles.blockHint}>
            You can review {subjectName} from {formatDate(state.review_opens_at)}.
          </p>
        </div>
      </div>
    );
  }

  // Finished but not confirmed yet — only the retailer can close it off.
  if (canComplete) {
    return (
      <div className={styles.block}>
        <span className={styles.blockIcon}>
          <StarIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>Did this shift go ahead?</p>
          <p className={styles.blockHint}>
            Confirm it to close the shift off and open reviews in 3 days.
          </p>
        </div>
        <span className={styles.blockAction}>
          <CompleteShiftButton shiftId={shiftId} />
        </span>
      </div>
    );
  }

  // Worker looking at a finished shift the store has not confirmed yet.
  if (state.viewer_role === "worker") {
    return (
      <div className={styles.block}>
        <span className={styles.blockIcon}>
          <LockIcon />
        </span>
        <div className={styles.blockText}>
          <p className={styles.blockLabel}>Waiting on the store</p>
          <p className={styles.blockHint}>
            Reviews open 3 days after {subjectName} confirms this shift was completed.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
