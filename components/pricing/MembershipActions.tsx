"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { openBillingPortal, startMembershipCheckout } from "@/app/actions/billing";
import { buttonClass } from "@/components/ui/buttonClass";

/**
 * The two membership buttons.
 *
 * Neither of them changes any membership state: they ask the server for a
 * Stripe-hosted URL and send the browser there. Activation only ever happens
 * from a Stripe-verified event.
 */
export function MembershipActions({
  hasMembership,
  startLabel = "Activate membership",
  manageLabel = "Manage membership",
}: {
  hasMembership: boolean;
  startLabel?: string;
  manageLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (action: () => Promise<{ ok: boolean; url?: string; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Something went wrong. Please try again.");
    });
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          className={buttonClass("primary")}
          onClick={() => go(startMembershipCheckout)}
          disabled={pending}
        >
          {pending ? "Opening secure checkout…" : startLabel}
        </button>

        {hasMembership ? (
          <button
            type="button"
            className={buttonClass("ghost")}
            onClick={() => go(openBillingPortal)}
            disabled={pending}
          >
            {manageLabel}
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#a63f27",
          }}
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * Shown after a return from Checkout while the payment is still being
 * confirmed. The page re-reads its state from the database on each refresh —
 * the query string never decides whether a membership is active.
 */
export function ConfirmingPoller({
  intervalMs = 3000,
  attempts = 5,
}: {
  intervalMs?: number;
  attempts?: number;
}) {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= attempts) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [tries, attempts, intervalMs, router]);

  return null;
}
