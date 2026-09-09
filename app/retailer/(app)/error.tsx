"use client";

import RouteError from "@/components/dashboard/RouteError";

export default function RetailerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} area="retailer" />;
}
