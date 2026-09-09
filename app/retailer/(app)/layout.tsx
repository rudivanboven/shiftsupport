import type { ReactNode } from "react";
import DashboardShell, { type NavSection } from "@/components/dashboard/DashboardShell";
import { requireRetailer } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";

export default async function RetailerAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, store } = await requireRetailer();
  const { notifications, unreadCount } = await getNotifications();

  // Badge on "Applicants" — pending applications across this store's shifts.
  const supabase = await createClient();
  const { data: openShiftIds } = await supabase
    .from("shifts")
    .select("id")
    .eq("store_id", store.id);

  let pendingCount = 0;
  if (openShiftIds?.length) {
    const { count } = await supabase
      .from("shift_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .in(
        "shift_id",
        openShiftIds.map((s) => s.id),
      );
    pendingCount = count ?? 0;
  }

  const sections: NavSection[] = [
    {
      items: [
        { href: "/retailer/dashboard", label: "Dashboard", icon: "home" },
        { href: "/retailer/shifts", label: "My Shifts", icon: "calendar" },
        { href: "/retailer/shifts/new", label: "Post a Shift", icon: "plus" },
        {
          href: "/retailer/applicants",
          label: "Applicants",
          icon: "users",
          count: pendingCount,
        },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/retailer/store", label: "My Store", icon: "store" },
        { href: "/retailer/profile", label: "Profile & Settings", icon: "user" },
      ],
    },
  ];

  return (
    <DashboardShell
      role="retailer"
      roleLabel="Retailer"
      sections={sections}
      userName={profile.full_name ?? "Retailer"}
      userSubtitle={store.name}
      notifications={notifications}
      unreadCount={unreadCount}
      promo={{
        title: "Need cover this week?",
        text: "Shifts posted before Wednesday get the most applicants.",
      }}
    >
      {children}
    </DashboardShell>
  );
}
