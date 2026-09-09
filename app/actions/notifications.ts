"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (ids?.length) query = query.in("id", ids);

  const { error } = await query;
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/worker", "layout");
  revalidatePath("/retailer", "layout");
  return { ok: true as const };
}
