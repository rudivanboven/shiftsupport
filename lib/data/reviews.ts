import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  RatingSummary,
  ShiftReviewState,
  StoreReviewEntry,
  WorkerReviewEntry,
} from "@/lib/supabase/types";

/** Kept in step with `public.review_delay()` — the database is authoritative. */
export const REVIEW_DELAY_DAYS = 3;

const EMPTY_RATING: RatingSummary = { average: null, total: 0 };

/**
 * Review state for a batch of shifts, straight from the database.
 *
 * `can_review` is computed server-side against the database clock, so the UI
 * only ever *renders* the verdict — it never works it out from `Date.now()`.
 * Shifts the caller had nothing to do with simply come back missing.
 */
export async function getShiftReviewStates(shiftIds: string[]) {
  if (shiftIds.length === 0) return new Map<string, ShiftReviewState>();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shift_review_state", {
    p_shift_ids: shiftIds,
  });

  if (error) {
    console.error("[getShiftReviewStates]", error.message);
    return new Map<string, ShiftReviewState>();
  }

  const states = new Map<string, ShiftReviewState>();
  for (const row of (data ?? []) as ShiftReviewState[]) {
    states.set(row.shift_id, row);
  }
  return states;
}

async function readRating(
  fn: "worker_rating" | "store_rating",
  arg: Record<string, string>,
): Promise<RatingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, arg);

  if (error) {
    console.error(`[${fn}]`, error.message);
    return EMPTY_RATING;
  }

  const row = (data as { average: number | string | null; total: number }[] | null)?.[0];
  if (!row || !row.total) return EMPTY_RATING;

  return {
    // numeric comes back as a string from PostgREST.
    average: row.average === null ? null : Number(row.average),
    total: Number(row.total),
  };
}

/** Average of the retailer -> worker reviews about this worker. */
export const getWorkerRating = (workerId: string) =>
  readRating("worker_rating", { p_worker_id: workerId });

/** Average of the worker -> retailer reviews about this store. */
export const getStoreRating = (storeId: string) =>
  readRating("store_rating", { p_store_id: storeId });

/** What retailers have said about this worker, newest first. */
export async function getWorkerReviews(workerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_worker_reviews", {
    p_worker_id: workerId,
  });

  if (error) {
    console.error("[getWorkerReviews]", error.message);
    return [] as WorkerReviewEntry[];
  }
  return (data ?? []) as WorkerReviewEntry[];
}

/** What workers have said about this store, newest first. */
export async function getStoreReviews(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_store_reviews", {
    p_store_id: storeId,
  });

  if (error) {
    console.error("[getStoreReviews]", error.message);
    return [] as StoreReviewEntry[];
  }
  return (data ?? []) as StoreReviewEntry[];
}

/**
 * Workers ranked by rating. Ordered in the database by average and then by
 * review count, so one lucky 5-star review cannot outrank a long record.
 */
export async function getTopRatedWorkers(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_top_rated_workers", {
    p_limit: limit,
  });

  if (error) {
    console.error("[getTopRatedWorkers]", error.message);
    return [];
  }

  return (data ?? []) as {
    worker_id: string;
    full_name: string | null;
    average: number | string;
    total: number;
  }[];
}
