"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hireApplicant, rejectApplicant } from "@/app/actions/applications";
import {
  Alert,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";

export default function ApplicantActions({
  applicationId,
  workerName,
  shiftFilled,
}: {
  applicationId: string;
  workerName: string;
  shiftFilled: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "hire" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setMode("idle");
        return;
      }
      setMode("idle");
      router.refresh();
    });
  };

  if (error) {
    return (
      <div style={{ flexBasis: "100%" }}>
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }

  if (mode === "hire") {
    return (
      <>
        <span
          style={{
            fontSize: 13,
            color: "var(--muted)",
            fontFamily: "var(--font-body)",
          }}
        >
          Hire {workerName} for this shift?
        </span>
        <button
          type="button"
          className={buttonClass("primary", { small: true })}
          disabled={pending}
          onClick={() => run(() => hireApplicant(applicationId))}
        >
          {pending ? "Hiring…" : "Yes, hire"}
        </button>
        <button
          type="button"
          className={buttonClass("ghost", { small: true })}
          disabled={pending}
          onClick={() => setMode("idle")}
        >
          Cancel
        </button>
      </>
    );
  }

  if (mode === "reject") {
    return (
      <div style={{ flexBasis: "100%", display: "grid", gap: 10 }}>
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (optional) — the worker will see this"
          maxLength={200}
          style={{
            width: "100%",
            padding: "11px 14px",
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--surface)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
          }}
        />
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button
            type="button"
            className={buttonClass("danger", { small: true })}
            disabled={pending}
            onClick={() => run(() => rejectApplicant(applicationId, reason))}
          >
            {pending ? "Saving…" : "Decline application"}
          </button>
          <button
            type="button"
            className={buttonClass("ghost", { small: true })}
            disabled={pending}
            onClick={() => setMode("idle")}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass("primary", { small: true })}
        onClick={() => setMode("hire")}
        disabled={shiftFilled}
        title={shiftFilled ? "Someone has already been hired for this shift" : undefined}
      >
        Hire
      </button>
      <button
        type="button"
        className={buttonClass("ghost", { small: true })}
        onClick={() => setMode("reject")}
      >
        Reject
      </button>
    </>
  );
}
