import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthLayout from "@/components/auth/AuthLayout";
import { getSuperAdmin } from "@/lib/admin/auth";
import SuperAdminLoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Operations Control Center",
  robots: { index: false, follow: false },
};

export default async function SuperAdminLoginPage() {
  // Already an active Super Admin in this browser? Go straight in.
  if (await getSuperAdmin()) redirect("/super-admin");

  return (
    <AuthLayout
      badge="Internal"
      asideTitle="Operations Control Center"
      asideText="The internal control centre for ShiftSupport operations: workers, retailers, shifts, payments and payroll in one place."
      points={[
        "Access is granted by the primary Super Admin only",
        "Every sensitive action is written to the audit log",
        "Worker and retailer logins have no access here",
      ]}
      eyebrow="Super Admin"
      title="Sign in to operations"
      subtitle="Use your operations account. Worker and retailer accounts cannot sign in here."
    >
      <SuperAdminLoginForm />
    </AuthLayout>
  );
}
