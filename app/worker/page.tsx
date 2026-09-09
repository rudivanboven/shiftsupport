import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/auth/session";

export default async function WorkerIndexPage() {
  const user = await getUser();
  if (!user) redirect("/worker/login");

  const profile = await getProfile();
  redirect(profile?.role === "retailer" ? "/retailer/dashboard" : "/worker/dashboard");
}
