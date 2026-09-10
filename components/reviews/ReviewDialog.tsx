"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "@/app/actions/reviews";
import { buttonClass } from "@/components/ui/buttonClass";
import StarRating from "./StarRating";
import styles from "./Review.module.css";

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.4 4.4L19 7.4" />
    </svg>
  );
}

/**
 * "Rate your experience" modal.
 *
 * The server action is the only thing that decides whether the review is
 * allowed — this just collects a rating and a comment and reports back what
 * the database said.
 */
export default function ReviewDialog({
  shiftId,
  subjectName,
  subjectLabel,
  triggerLabel,
}: {
  shiftId: string;
  /** Who is being rated — a worker's name or a store's name. */
  subjectName: string;
  /** "worker" / "store", used in the prompt copy. */
  subjectLabel: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, pending]);

  const submit = () => {
    if (rating < 1) {
      setError("Choose a rating between 1 and 5 stars.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await submitReview(shiftId, rating, comment);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    // Reset only after a failed attempt; a completed one stays closed for good.
    if (!done) setError(null);
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass("primary", { small: true })}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={`Rate ${subjectName}`}
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) close();
          }}
        >
          <div className={styles.modal}>
            {done ? (
              <div className={styles.success}>
                <div className={styles.successMark}>
                  <CheckMark />
                </div>
                <p className={styles.title}>Thanks for your review.</p>
                <p className={styles.subtitle}>
                  Your rating of {subjectName} has been saved. Reviews can&rsquo;t be
                  changed once submitted.
                </p>
                <div className={styles.actions} style={{ justifyContent: "center" }}>
                  <button
                    type="button"
                    className={buttonClass("primary")}
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className={styles.eyebrow}>Shift review</p>
                <h2 className={styles.title}>Rate your experience with {subjectName}</h2>
                <p className={styles.subtitle}>
                  How was this {subjectLabel}? Your rating is permanent, so take a
                  moment over it.
                </p>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Your rating</span>
                  <StarRating value={rating} onChange={setRating} disabled={pending} />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={`review-comment-${shiftId}`}>
                    Optional feedback
                  </label>
                  <textarea
                    id={`review-comment-${shiftId}`}
                    className={styles.textarea}
                    value={comment}
                    maxLength={1000}
                    disabled={pending}
                    placeholder={`What stood out about this ${subjectLabel}?`}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={buttonClass("ghost")}
                    onClick={close}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={buttonClass("primary")}
                    onClick={submit}
                    disabled={pending}
                  >
                    {pending ? "Submitting…" : "Submit review"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
