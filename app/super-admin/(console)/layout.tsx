import type { Metadata } from "next";
import type { ReactNode } from "react";

import AdminShell from "@/components/super-admin/AdminShell";
import { requireSuperAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Operations Control Center",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Gate for the whole console. `requireSuperAdmin` sends a signed-out visitor to
 * the operations login and answers 404 for a signed-in worker or retailer, so
 * guessing the URL reveals nothing.
 *
 * This layout is a convenience, not the security boundary: every admin data
 * function and every admin server action re-authorises on its own.
 */
export default async function SuperAdminConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireSuperAdmin();

  return (
    <AdminShell
      adminName={admin.fullName ?? admin.email.split("@")[0]}
      adminEmail={admin.email}
      isPrimary={admin.isPrimary}
    >
      {children}
    </AdminShell>
  );
}
