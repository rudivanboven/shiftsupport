import type { Metadata } from "next";

import { syncMembership } from "@/app/actions/billing";
import PricingPayments from "@/components/pricing/PricingPayments";
import { requireWorker } from "@/lib/auth/session";
import { getMembership } from "@/lib/membership";

export const metadata: Metadata = { title: "Pricing & payments | ShiftSupport for workers" };

export default async function WorkerPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  // The layout already gates this area; the guard is repeated here so the page
  // itself can never render its amounts to a signed-out or non-worker visitor.
  const { worker } = await requireWorker();
  const params = await searchParams;

  const checkout =
    params.checkout === "success" || params.checkout === "canceled"
      ? params.checkout
      : null;

  // Coming back from Checkout, ask Stripe what actually happened rather than
  // believing the redirect. The webhook does the same work; whichever arrives
  // first wins and the other one is a no-op.
  if (checkout === "success") {
    await syncMembership(params.session_id);
  }

  const membership = await getMembership(worker.id);

  return (
    <PricingPayments role="worker" membership={membership} checkout={checkout} />
  );
}
