"use client";

import { useState, useTransition } from "react";

import { createShiftPaymentSession } from "@/app/actions/billing";
import { buttonClass } from "@/components/ui/buttonClass";

/**
 * Sends the retailer to Stripe Checkout for this shift.
 *
 * The amount is not passed from here — the server recomputes it from the hours
 * stored on the shift, so there is nothing in this component for a tampered
 * request to change except which shift is being paid for, and the server
 * checks that the shift belongs to the caller's store.
 */
export default function PayShiftButton({
  shiftId,
  label = "Pay & publish shift",
  variant = "primary",
  small = false,
}: {
  shiftId: string;
  label?: string;
  variant?: "primary" | "ghost";
  small?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pay = () => {
    setError(null);
    startTransition(async () => {
      const result = await createShiftPaymentSession(shiftId);
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      setError(result.error);
    });
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass(variant, { small })}
        onClick={pay}
        disabled={pending}
      >
        {pending ? "Opening secure checkout…" : label}
      </button>
      {error ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#a63f27" }}>{error}</p>
      ) : null}
    </>
  );
}
