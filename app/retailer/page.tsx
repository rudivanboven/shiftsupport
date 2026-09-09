import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/auth/session";

export default async function RetailerIndexPage() {
  const user = await getUser();
  if (!user) redirect("/retailer/login");

  const profile = await getProfile();
  redirect(profile?.role === "worker" ? "/worker/dashboard" : "/retailer/dashboard");
}
