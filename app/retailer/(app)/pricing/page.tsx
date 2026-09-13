import type { Metadata } from "next";
import PricingPayments from "@/components/pricing/PricingPayments";
import { requireRetailer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Pricing & payments | ShiftSupport for retailers" };

export default async function RetailerPricingPage() {
  // The layout already gates this area; the guard is repeated here so the page
  // itself can never render its amounts to a signed-out or non-retailer visitor.
  await requireRetailer();

  return <PricingPayments role="retailer" />;
}
