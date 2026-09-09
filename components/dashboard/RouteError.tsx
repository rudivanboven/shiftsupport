"use client";

import { useEffect } from "react";
import { ErrorState, Panel } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";

/** Client error boundary shared by every dashboard route. */
export default function RouteError({
  error,
  reset,
  area,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  area: string;
}) {
  useEffect(() => {
    console.error(`[${area}]`, error);
  }, [error, area]);

  return (
    <Panel>
      <ErrorState
        title="Something went wrong"
        text="We couldn't load this page. This is usually temporary — try again, and let us know if it keeps happening."
        action={
          <button type="button" className={buttonClass("primary")} onClick={reset}>
            Try again
          </button>
        }
      />
    </Panel>
  );
}
