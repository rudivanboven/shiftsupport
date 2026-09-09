"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyForShift } from "@/app/actions/applications";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconCheck } from "@/components/dashboard/Icons";

export default function ApplyButton({
  shiftId,
  alreadyApplied,
}: {
  shiftId: string;
  alreadyApplied: boolean;
}) {
  const [applied, setApplied] = useState(alreadyApplied);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (applied) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 16px",
          borderRadius: 999,
          background: "var(--brand-green-tint)",
          color: "#1c5427",
          fontFamily: "var(--font-heading)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <IconCheck width={15} height={15} />
        Application sent
      </span>
    );
  }

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyForShift(shiftId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApplied(true);
      router.refresh();
    });
  };

  return (
    <>
      {error ? (
        <span
          style={{
            flexBasis: "100%",
            fontSize: 12.5,
            color: "#a63f27",
            fontFamily: "var(--font-body)",
          }}
        >
          {error}
        </span>
      ) : null}
      <button
        type="button"
        className={buttonClass("primary", { small: true })}
        onClick={apply}
        disabled={pending}
      >
        {pending ? "Applying…" : "Apply for shift"}
      </button>
    </>
  );
}
