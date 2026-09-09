"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelShift } from "@/app/actions/shifts";
import { buttonClass } from "@/components/ui/buttonClass";

export default function CancelShiftButton({
  shiftId,
  label = "Cancel shift",
}: {
  shiftId: string;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelShift(shiftId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
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

  if (!confirming) {
    return (
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass("danger", { small: true })}
        onClick={confirm}
        disabled={pending}
      >
        {pending ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Keep it
      </button>
    </>
  );
}
