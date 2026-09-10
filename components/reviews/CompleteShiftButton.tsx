"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeShift } from "@/app/actions/reviews";
import { buttonClass } from "@/components/ui/buttonClass";

/**
 * Confirms a finished shift actually happened. This is what turns a past
 * shift into a genuinely completed one and starts the review clock — the app
 * never assumes it from the end time alone.
 */
export default function CompleteShiftButton({ shiftId }: { shiftId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeShift(shiftId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (error) {
    return (
      <span style={{ fontSize: 12.5, color: "#a63f27", fontFamily: "var(--font-body)" }}>
        {error}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={buttonClass("primary", { small: true })}
      onClick={confirm}
      disabled={pending}
    >
      {pending ? "Confirming…" : "Mark completed"}
    </button>
  );
}
