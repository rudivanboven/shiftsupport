"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Errors the database raises on purpose, with a message written for the
 * person reading it. Anything else is a bug and gets a generic message.
 */
const SPOKEN_CODES = new Set(["P0001", "P0002", "22023", "23505", "42501"]);

function friendlyError(error: { code?: string; message: string } | null) {
  if (!error) return "Something went wrong. Please try again.";
  if (SPOKEN_CODES.has(error.code ?? "")) return error.message;

  console.error("[reviews]", error);
  return "Something went wrong. Please try again.";
}

function revalidateEverywhere() {
  revalidatePath("/retailer/dashboard");
  revalidatePath("/retailer/shifts");
  revalidatePath("/retailer/store");
  revalidatePath("/worker/dashboard");
  revalidatePath("/worker/my-shifts");
  revalidatePath("/worker/profile");
}

/**
 * Marks a finished shift as completed, which is what starts the 3-day review
 * clock. Every check that matters (store ownership, a worker was hired, the
 * shift has actually ended) lives in `complete_shift` on the database side.
 */
export async function completeShift(shiftId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_shift", { p_shift_id: shiftId });

  if (error) return { ok: false as const, error: friendlyError(error) };

  revalidateEverywhere();
  return { ok: true as const };
}

/**
 * Submits one review.
 *
 * The client sends a shift id, a rating and a comment — nothing else. Who is
 * reviewing whom, in which direction, and whether the waiting period has
 * elapsed are all decided by `submit_review` from the session's own user id,
 * so none of it can be forged by editing the request.
 */
export async function submitReview(
  shiftId: string,
  rating: number,
  comment: string,
) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false as const, error: "Choose a rating between 1 and 5 stars." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_review", {
    p_shift_id: shiftId,
    p_rating: rating,
    p_comment: comment.trim() || null,
  });

  if (error) return { ok: false as const, error: friendlyError(error) };

  revalidateEverywhere();
  return { ok: true as const };
}
