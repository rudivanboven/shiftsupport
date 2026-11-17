import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "./index";
import {
  executeRetailerReminderJob,
  executeRetailerWelcomeEmail,
  executeWorkerWelcomeEmail,
  PENDING_CLAIM_TIMEOUT_MS,
  RETAILER_REMINDER_INTERVAL_MS,
  type ClaimDeliveryInput,
  type ClaimDeliveryResult,
  type CompleteDeliveryInput,
  type EmailWorkflowRepository,
  type RetailerReminderCandidate,
  type RetailerReminderJobSummary,
  type SendWorkflowEmailResult,
} from "./workflows";

type AdminClient = ReturnType<typeof createAdminClient>;

const DELIVERIES_TABLE = "email_workflow_deliveries";
const REMINDERS_TABLE = "retailer_onboarding_reminders";

export function createSupabaseWorkflowRepository(
  admin: AdminClient = createAdminClient(),
): EmailWorkflowRepository {
  return {
    async verifyWorkerAccount(userId: string) {
      const [
        { data: profile, error: profileError },
        { data: worker, error: workerError },
        { data: storeUser, error: storeUserError },
      ] =
        await Promise.all([
          admin
            .from("profiles")
            .select("id,role,email,full_name")
            .eq("id", userId)
            .maybeSingle(),
          admin
            .from("workers")
            .select("id,email,full_name")
            .eq("auth_user_id", userId)
            .maybeSingle(),
          admin
            .from("store_users")
            .select("id")
            .eq("auth_user_id", userId)
            .maybeSingle(),
        ]);
      if (profileError) throw profileError;
      if (workerError) throw workerError;
      if (storeUserError) throw storeUserError;

      const role = (profile?.role as string | null) ?? null;
      const isRetailer = role === "retailer" || Boolean(storeUser?.id);
      const isValidWorker =
        role === "worker" && Boolean(worker?.id) && !isRetailer;

      return {
        isValidWorker,
        isRetailer,
        userId,
        workerId: (worker?.id as string | null) ?? null,
        email:
          (worker?.email as string | null) ??
          (profile?.email as string | null) ??
          null,
        fullName:
          (worker?.full_name as string | null) ??
          (profile?.full_name as string | null) ??
          null,
      };
    },

    async verifyRetailerAccount(userId: string, storeId?: string | null) {
      const [
        { data: profile, error: profileError },
        { data: storeUser, error: storeUserError },
        { data: worker, error: workerError },
      ] =
        await Promise.all([
          admin
            .from("profiles")
            .select("id,role,email,full_name,created_at")
            .eq("id", userId)
            .maybeSingle(),
          admin
            .from("store_users")
            .select("id,store_id,email,role,created_at")
            .eq("auth_user_id", userId)
            .maybeSingle(),
          admin
            .from("workers")
            .select("id")
            .eq("auth_user_id", userId)
            .maybeSingle(),
        ]);
      if (profileError) throw profileError;
      if (storeUserError) throw storeUserError;
      if (workerError) throw workerError;

      const role = (profile?.role as string | null) ?? null;
      const isWorker = role === "worker" || Boolean(worker?.id);
      const resolvedStoreId =
        storeId ?? (storeUser?.store_id as string | null) ?? null;

      let storeName: string | null = null;
      let storeCreatedAt: string | null = null;
      if (resolvedStoreId) {
        const { data: store, error: storeError } = await admin
          .from("stores")
          .select("id,name,created_at")
          .eq("id", resolvedStoreId)
          .maybeSingle();
        if (storeError) throw storeError;
        storeName = (store?.name as string | null) ?? null;
        storeCreatedAt = (store?.created_at as string | null) ?? null;
      }

      const isValidRetailer =
        role === "retailer" && Boolean(resolvedStoreId) && !isWorker;

      return {
        isValidRetailer,
        isWorker,
        userId,
        storeId: resolvedStoreId,
        email:
          (storeUser?.email as string | null) ??
          (profile?.email as string | null) ??
          null,
        fullName: (profile?.full_name as string | null) ?? null,
        storeName,
        registeredAt:
          (storeUser?.created_at as string | null) ??
          storeCreatedAt ??
          (profile?.created_at as string | null) ??
          null,
      };
    },

    async ensureRetailerReminderSchedule({ storeId, userId, registeredAt }) {
      const regIso = registeredAt.toISOString();
      const nextDueIso = new Date(
        registeredAt.getTime() + RETAILER_REMINDER_INTERVAL_MS,
      ).toISOString();

      const { error } = await admin.from(REMINDERS_TABLE).upsert(
        {
          store_id: storeId,
          auth_user_id: userId,
          registered_at: regIso,
          next_reminder_due_at: nextDueIso,
        },
        { onConflict: "store_id", ignoreDuplicates: true },
      );

      if (error) throw error;
    },

    async claimDelivery(input: ClaimDeliveryInput): Promise<ClaimDeliveryResult> {
      const nowIso = input.now.toISOString();

      const { error: insertError } = await admin.from(DELIVERIES_TABLE).insert({
        idempotency_key: input.idempotencyKey,
        email_type: input.emailType,
        recipient_role: input.recipientRole,
        user_id: input.userId,
        worker_id: input.workerId,
        store_id: input.storeId,
        recipient_email: input.recipientEmail,
        subject: input.subject,
        reminder_sequence: input.reminderSequence,
        status: "pending",
        attempt_count: 1,
        last_attempt_at: nowIso,
        updated_at: nowIso,
      });

      if (!insertError) {
        return { claimed: true, attemptCount: 1 };
      }

      if (insertError.code !== "23505") throw insertError;

      // Unique violation (23505): inspect existing record to determine if sent, in-progress, or retryable.
      const { data: existing, error: selectError } = await admin
        .from(DELIVERIES_TABLE)
        .select("id,status,attempt_count,last_attempt_at")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();

      if (selectError || !existing) {
        throw new Error(
          `Could not verify email delivery claim (${input.idempotencyKey}): ${
            selectError?.message ?? insertError.message
          }`,
        );
      }

      const status = existing.status as string;
      if (status === "sent") {
        return { claimed: false, reason: "already_sent" };
      }

      if (status === "pending") {
        const lastAttemptMs = existing.last_attempt_at
          ? Date.parse(existing.last_attempt_at as string)
          : 0;
        if (input.now.getTime() - lastAttemptMs < PENDING_CLAIM_TIMEOUT_MS) {
          return { claimed: false, reason: "in_progress" };
        }
      }

      const nextAttempt = (Number(existing.attempt_count) || 1) + 1;
      const { data: reclaimed, error: updateError } = await admin
        .from(DELIVERIES_TABLE)
        .update({
          status: "pending",
          attempt_count: nextAttempt,
          last_attempt_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .eq("status", status)
        .select("id")
        .maybeSingle();

      if (updateError || !reclaimed) {
        return { claimed: false, reason: "in_progress" };
      }

      return { claimed: true, attemptCount: nextAttempt };
    },

    async completeDelivery(
      idempotencyKey: string,
      input: CompleteDeliveryInput,
    ) {
      const nowIso = input.now.toISOString();
      const updatePayload: Record<string, unknown> = {
        status: input.status,
        provider: input.provider,
        provider_message_id: input.providerMessageId,
        last_error: input.error ? input.error.slice(0, 500) : null,
        last_attempt_at: nowIso,
        updated_at: nowIso,
      };
      if (input.status === "sent") {
        updatePayload.sent_at = nowIso;
      }

      const { error } = await admin
        .from(DELIVERIES_TABLE)
        .update(updatePayload)
        .eq("idempotency_key", idempotencyKey);

      if (error) throw error;
    },

    async hasStorePostedShift(storeId: string) {
      const { data, error } = await admin
        .from("shifts")
        .select("id,created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return {
        posted: Boolean(data?.id),
        firstShiftAt: (data?.created_at as string | null) ?? null,
      };
    },

    async markFirstShiftPosted(storeId: string, postedAt: Date | string) {
      const iso =
        typeof postedAt === "string" ? postedAt : postedAt.toISOString();
      const nowIso = new Date().toISOString();

      const { error } = await admin
        .from(REMINDERS_TABLE)
        .update({
          first_shift_posted_at: iso,
          stopped_at: nowIso,
          stopped_reason: "first_shift_posted",
          updated_at: nowIso,
        })
        .eq("store_id", storeId)
        .is("first_shift_posted_at", null);

      if (error) throw error;
    },

    async listRetailerReminderCandidates(): Promise<RetailerReminderCandidate[]> {
      const [
        { data: stores, error: storesError },
        { data: storeUsers, error: storeUsersError },
        { data: profiles, error: profilesError },
        { data: workers, error: workersError },
        { data: shifts, error: shiftsError },
        { data: schedules, error: schedulesError },
      ] = await Promise.all([
        admin
          .from("stores")
          .select("id,name,created_at")
          .order("created_at", { ascending: true }),
        admin
          .from("store_users")
          .select("id,store_id,auth_user_id,role,created_at")
          .order("created_at", { ascending: true }),
        admin.from("profiles").select("id,full_name,email,role,created_at"),
        admin.from("workers").select("id,auth_user_id"),
        admin
          .from("shifts")
          .select("id,store_id,created_at")
          .order("created_at", { ascending: true }),
        admin
          .from(REMINDERS_TABLE)
          .select(
            "store_id,auth_user_id,registered_at,reminders_sent_count,last_reminder_sent_at,next_reminder_due_at,first_shift_posted_at,stopped_at,stopped_reason",
          ),
      ]);

      if (storesError) {
        throw new Error(`Could not read stores: ${storesError.message}`);
      }
      if (storeUsersError) {
        throw new Error(`Could not read store_users: ${storeUsersError.message}`);
      }
      if (profilesError) throw new Error(`Could not read profiles: ${profilesError.message}`);
      if (workersError) throw new Error(`Could not read workers: ${workersError.message}`);
      if (shiftsError) throw new Error(`Could not read shifts: ${shiftsError.message}`);
      if (schedulesError) throw new Error(`Could not read retailer reminder schedules: ${schedulesError.message}`);

      const profileById = new Map(
        ((profiles ?? []) as {
          id: string;
          full_name: string | null;
          email: string | null;
          role: "worker" | "retailer" | "admin";
          created_at: string | null;
        }[]).map((p) => [p.id, p]),
      );

      const workerAuthIds = new Set(
        ((workers ?? []) as { auth_user_id: string | null }[])
          .map((w) => w.auth_user_id)
          .filter((id): id is string => Boolean(id)),
      );

      const ownerByStore = new Map<
        string,
        {
          id: string;
          store_id: string;
          auth_user_id: string | null;
          role: string | null;
          created_at: string | null;
        }
      >();
      const sortedStoreUsers = [
        ...((storeUsers ?? []) as {
          id: string;
          store_id: string;
          auth_user_id: string | null;
          role: string | null;
          created_at: string | null;
        }[]),
      ].filter((storeUser) => storeUser.role === "owner");

      for (const su of sortedStoreUsers) {
        if (!ownerByStore.has(su.store_id)) {
          ownerByStore.set(su.store_id, su);
        }
      }

      const shiftsByStore = new Map<
        string,
        { count: number; firstCreatedAt: string | null }
      >();
      for (const sh of (shifts ?? []) as {
        id: string;
        store_id: string;
        created_at: string | null;
      }[]) {
        const current = shiftsByStore.get(sh.store_id);
        if (!current) {
          shiftsByStore.set(sh.store_id, {
            count: 1,
            firstCreatedAt: sh.created_at ?? null,
          });
        } else {
          current.count += 1;
        }
      }

      const scheduleByStore = new Map(
        ((schedules ?? []) as {
          store_id: string;
          auth_user_id: string | null;
          registered_at: string;
          reminders_sent_count: number;
          last_reminder_sent_at: string | null;
          next_reminder_due_at: string | null;
          first_shift_posted_at: string | null;
          stopped_at: string | null;
          stopped_reason: string | null;
        }[]).map((s) => [s.store_id, s]),
      );

      const results: RetailerReminderCandidate[] = [];

      for (const store of (stores ?? []) as {
        id: string;
        name: string;
        created_at: string | null;
      }[]) {
        const owner = ownerByStore.get(store.id);
        if (!owner) continue;

        const authUserId = owner.auth_user_id;
        const profile = authUserId ? profileById.get(authUserId) : undefined;
        const schedule = scheduleByStore.get(store.id);
        const shiftStats = shiftsByStore.get(store.id) ?? {
          count: 0,
          firstCreatedAt: null,
        };

        const registeredAt =
          schedule?.registered_at ??
          owner.created_at ??
          store.created_at ??
          profile?.created_at ??
          new Date().toISOString();

        const role = profile?.role ?? "retailer";
        const isWorker =
          role === "worker" ||
          Boolean(authUserId && workerAuthIds.has(authUserId));

        results.push({
          storeId: store.id,
          userId: authUserId,
          email: profile?.email ?? null,
          fullName: profile?.full_name ?? null,
          storeName: store.name,
          role,
          isWorker,
          registeredAt,
          remindersSentCount: Number(schedule?.reminders_sent_count ?? 0),
          lastReminderSentAt: schedule?.last_reminder_sent_at ?? null,
          nextReminderDueAt: schedule?.next_reminder_due_at ?? null,
          firstShiftPostedAt: schedule?.first_shift_posted_at ?? null,
          stoppedAt: schedule?.stopped_at ?? null,
          stoppedReason: schedule?.stopped_reason ?? null,
          shiftsCount: shiftStats.count,
          firstShiftCreatedAt: shiftStats.firstCreatedAt,
        });
      }

      return results;
    },

    async recordReminderSent({ storeId, step, sentAt, nextReminderDueAt }) {
      const { error } = await admin
        .from(REMINDERS_TABLE)
        .upsert({
          store_id: storeId,
          reminders_sent_count: step,
          last_reminder_sent_at: sentAt,
          next_reminder_due_at: nextReminderDueAt,
          last_error: null,
          last_attempt_at: sentAt,
          updated_at: sentAt,
        }, { onConflict: "store_id" });

      if (error) throw error;
    },

    async recordReminderFailed({ storeId, attemptedAt, error }) {
      const { error: updateErr } = await admin
        .from(REMINDERS_TABLE)
        .update({
          last_error: error.slice(0, 500),
          last_attempt_at: attemptedAt,
          updated_at: attemptedAt,
        })
        .eq("store_id", storeId);

      if (updateErr) throw updateErr;
    },
  };
}

/**
 * Sends the Worker Welcome Email after successful worker signup & profile creation.
 */
export async function sendWorkerWelcomeEmail(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  siteUrl?: string | null;
}): Promise<SendWorkflowEmailResult> {
  return executeWorkerWelcomeEmail(input, {
    repo: createSupabaseWorkflowRepository(),
    getEmailProvider,
  });
}

/**
 * Sends the Retailer Welcome Email after successful retailer signup & store creation,
 * and initializes the 14-day onboarding reminder schedule.
 */
export async function sendRetailerWelcomeEmail(input: {
  userId: string;
  storeId?: string | null;
  email?: string | null;
  fullName?: string | null;
  storeName?: string | null;
  siteUrl?: string | null;
}): Promise<SendWorkflowEmailResult> {
  return executeRetailerWelcomeEmail(input, {
    repo: createSupabaseWorkflowRepository(),
    getEmailProvider,
  });
}

/**
 * Marks a retailer store as having posted its first shift so all future 14-day
 * onboarding reminders stop immediately.
 */
export async function markRetailerFirstShiftPosted(
  storeId: string,
  postedAt: Date | string = new Date(),
): Promise<void> {
  try {
    const repo = createSupabaseWorkflowRepository();
    await repo.markFirstShiftPosted(storeId, postedAt);
  } catch (err) {
    console.error(
      "[email] Could not mark retailer first shift posted:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Runs the server-side 14-day retailer reminder check across all retailer stores.
 */
export async function runRetailerReminderJob(options?: {
  now?: Date;
  siteUrl?: string | null;
}): Promise<RetailerReminderJobSummary> {
  const now = options?.now ?? new Date();
  if (process.env.RETAILER_REMINDERS_ENABLED?.trim().toLowerCase() !== "true") {
    console.info(
      "[email] Retailer reminders are disabled; set RETAILER_REMINDERS_ENABLED=true to enable sending.",
    );
    return {
      ranAt: now.toISOString(),
      checked: 0,
      sent: 0,
      stopped: 0,
      notDue: 0,
      duplicatesPrevented: 0,
      skippedInvalidOrNonRetailer: 0,
      failed: 0,
      errors: [],
    };
  }

  return executeRetailerReminderJob(options, {
    repo: createSupabaseWorkflowRepository(),
    getEmailProvider,
  });
}
