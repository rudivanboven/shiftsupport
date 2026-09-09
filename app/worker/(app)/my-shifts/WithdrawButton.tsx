"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawApplication } from "@/app/actions/applications";
import { buttonClass } from "@/components/ui/buttonClass";

export default function WithdrawButton({ applicationId }: { applicationId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
        Withdraw
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass("danger", { small: true })}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawApplication(applicationId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Withdrawing…" : "Yes, withdraw"}
      </button>
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Keep it
      </button>
    </>
  );
}
