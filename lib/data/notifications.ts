import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/supabase/types";

export async function getNotifications(limit = 8) {
  const supabase = await createClient();

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return {
    notifications: (data ?? []) as Notification[],
    unreadCount: count ?? 0,
  };
}
