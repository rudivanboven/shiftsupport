"use client";

import RouteError from "@/components/dashboard/RouteError";

export default function WorkerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} area="worker" />;
}
