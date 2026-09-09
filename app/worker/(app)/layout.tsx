import type { ReactNode } from "react";
import DashboardShell, { type NavSection } from "@/components/dashboard/DashboardShell";
import { requireWorker } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";

export default async function WorkerAppLayout({ children }: { children: ReactNode }) {
  const { profile, worker } = await requireWorker();
  const { notifications, unreadCount } = await getNotifications();

  const supabase = await createClient();
  const { count: openCount } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .is("accepted_by", null);

  const sections: NavSection[] = [
    {
      items: [
        { href: "/worker/dashboard", label: "Dashboard", icon: "home" },
        {
          href: "/worker/available-shifts",
          label: "Available Shifts",
          icon: "search",
          count: openCount ?? 0,
        },
        { href: "/worker/my-shifts", label: "My Shifts", icon: "calendar" },
        {
          href: "/worker/notifications",
          label: "Notifications",
          icon: "bell",
          count: unreadCount,
        },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/worker/profile", label: "My Profile", icon: "user" }],
    },
  ];

  return (
    <DashboardShell
      role="worker"
      roleLabel="Worker"
      sections={sections}
      userName={profile.full_name ?? worker.full_name ?? "Worker"}
      userSubtitle="Find and manage your shifts"
      notifications={notifications}
      unreadCount={unreadCount}
      notificationsHref="/worker/notifications"
      promo={{
        title: "Keep your profile current",
        text: "Retailers see your name and phone number when they hire you.",
      }}
    >
      {children}
    </DashboardShell>
  );
}
