import type { RatingSummary } from "@/lib/supabase/types";
import styles from "./Stars.module.css";

/**
 * One star. `fill` is 0–1 so a 4.2 average can render a partly filled star
 * rather than rounding the number away.
 */
export function Star({
  fill = 1,
  large = false,
  id,
}: {
  fill?: number;
  large?: boolean;
  id?: string;
}) {
  const clipped = Math.max(0, Math.min(1, fill));
  const gradientId = `star-fill-${id ?? clipped.toFixed(2).replace(".", "")}`;
  const path =
    "M12 3.6l2.47 5.01 5.53.8-4 3.9.95 5.5L12 16.22l-4.95 2.6.95-5.5-4-3.9 5.53-.8z";

  return (
    <svg
      className={`${styles.star} ${large ? styles.starLarge : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {clipped > 0 && clipped < 1 ? (
        <defs>
          <linearGradient id={gradientId}>
            <stop offset={`${clipped * 100}%`} stopColor="currentColor" />
            <stop offset={`${clipped * 100}%`} stopColor="transparent" />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d={path}
        fill={clipped >= 1 ? "currentColor" : clipped <= 0 ? "none" : `url(#${gradientId})`}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
        opacity={clipped <= 0 ? 0.28 : 1}
      />
    </svg>
  );
}

/** Read-only row of five stars showing `value` out of 5. */
export function Stars({
  value,
  large = false,
  label,
}: {
  value: number;
  large?: boolean;
  label?: string;
}) {
  return (
    <span
      className={styles.stars}
      role="img"
      aria-label={label ?? `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          id={`${position}-${value}`}
          large={large}
          fill={Math.max(0, Math.min(1, value - position + 1))}
        />
      ))}
    </span>
  );
}

/**
 * Average + star row + how many reviews it is based on.
 * A worker or store with no reviews yet says so plainly rather than
 * showing a zero, which would read as a bad score.
 */
export function RatingBadge({
  rating,
  noun = "review",
  emptyLabel = "No reviews yet",
}: {
  rating: RatingSummary;
  noun?: string;
  emptyLabel?: string;
}) {
  if (!rating.total || rating.average === null) {
    return (
      <span className={styles.none}>
        <span className={styles.newBadge}>New</span>
        {emptyLabel}
      </span>
    );
  }

  return (
    <span className={styles.summary}>
      <Stars value={rating.average} label={`${rating.average} out of 5 stars`} />
      <span className={styles.average}>{rating.average.toFixed(1)}</span>
      <span className={styles.count}>
        {rating.total} {noun}
        {rating.total === 1 ? "" : "s"}
      </span>
    </span>
  );
}
