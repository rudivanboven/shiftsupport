"use client";

import { useState } from "react";
import { Star } from "./Stars";
import styles from "./Stars.module.css";

const WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

/**
 * The 1–5 star picker.
 *
 * Hovering previews a rating, clicking selects it. Rendered as real radio-ish
 * buttons so it is keyboard reachable and screen-reader legible, rather than
 * as clickable text.
 */
export default function StarRating({
  value,
  onChange,
  disabled = false,
  large = true,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  large?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className={styles.input} onMouseLeave={() => setHovered(0)}>
      <div role="radiogroup" aria-label="Rating out of 5 stars" className={styles.input}>
        {[1, 2, 3, 4, 5].map((position) => (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={value === position}
            aria-label={`${position} star${position === 1 ? "" : "s"}`}
            className={styles.starButton}
            disabled={disabled}
            onMouseEnter={() => !disabled && setHovered(position)}
            onFocus={() => !disabled && setHovered(position)}
            onClick={() => !disabled && onChange(position)}
          >
            <Star
              id={`pick-${position}`}
              large={large}
              fill={position <= shown ? 1 : 0}
            />
          </button>
        ))}
      </div>

      {shown > 0 ? (
        <span className={styles.inputLabel}>
          {shown} · {WORDS[shown]}
        </span>
      ) : (
        <span className={styles.inputHint}>Tap a star</span>
      )}
    </div>
  );
}
