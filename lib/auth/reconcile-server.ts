import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, PublicWorker, Store, StoreUser, UserRole } from "@/lib/supabase/types";
import {
  reconcileAuthenticatedAccount,
  type AuthUserLike,
  type ReconciledAccountResult,
  type ReconcileRepository,
} from "./reconcile";

export function createSupabaseReconcileRepository(
  admin = createAdminClient(),
): ReconcileRepository {
  return {
    async getProfileById(userId: string): Promise<Profile | null> {
      const { data, error } = await admin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },

    async upsertProfile(input): Promise<Profile> {
      const { data, error } = await admin
        .from("profiles")
        .upsert(
          {
            id: input.id,
            full_name: input.full_name,
            email: input.email,
            phone: input.phone,
            role: input.role,
            updated_at: input.updated_at,
          },
          { onConflict: "id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as Profile;
    },

    async getWorkerByAuthUserId(userId: string): Promise<PublicWorker | null> {
      const { data, error } = await admin
        .from("workers")
        .select("id,auth_user_id,memberstack_id,full_name,created_at")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicWorker | null) ?? null;
    },

    async getUnlinkedWorkerByEmail(email: string): Promise<PublicWorker | null> {
      const { data, error } = await admin
        .from("workers")
        .select("id,auth_user_id,memberstack_id,full_name,created_at")
        .ilike("email", email)
        .is("auth_user_id", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicWorker | null) ?? null;
    },

    async linkWorkerToAuthUser(workerId: string, input): Promise<PublicWorker> {
      const { data, error } = await admin
        .from("workers")
        .update({
          auth_user_id: input.auth_user_id,
          full_name: input.full_name,
          email: input.email,
          phone: input.phone,
          updated_at: input.updated_at,
        })
        .eq("id", workerId)
        .select("id,auth_user_id,memberstack_id,full_name,created_at")
        .single();
      if (error) throw error;
      return data as PublicWorker;
    },

    async insertWorker(input): Promise<PublicWorker> {
      const { data, error } = await admin
        .from("workers")
        .insert({
          auth_user_id: input.auth_user_id,
          full_name: input.full_name,
          email: input.email,
          phone: input.phone,
        })
        .select("id,auth_user_id,memberstack_id,full_name,created_at")
        .maybeSingle();

      if (error || !data) {
        const { data: raced, error: retryErr } = await admin
          .from("workers")
          .select("id,auth_user_id,memberstack_id,full_name,created_at")
          .eq("auth_user_id", input.auth_user_id)
          .maybeSingle();
        if (retryErr) throw retryErr;
        if (raced) return raced as PublicWorker;
        throw error ?? new Error("Failed to insert worker row.");
      }

      return data as PublicWorker;
    },

    async getStoreUserByAuthUserId(userId: string): Promise<StoreUser | null> {
      const { data, error } = await admin
        .from("store_users")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as StoreUser | null) ?? null;
    },

    async getUnlinkedStoreUserByEmail(email: string): Promise<StoreUser | null> {
      const { data, error } = await admin
        .from("store_users")
        .select("*")
        .ilike("email", email)
        .is("auth_user_id", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as StoreUser | null) ?? null;
    },

    async linkStoreUserToAuthUser(storeUserId: string, input): Promise<StoreUser> {
      const { data, error } = await admin
        .from("store_users")
        .update({
          auth_user_id: input.auth_user_id,
          email: input.email,
          updated_at: input.updated_at,
        })
        .eq("id", storeUserId)
        .select("*")
        .single();
      if (error) throw error;
      return data as StoreUser;
    },

    async getStoreById(storeId: string): Promise<Store | null> {
      const { data, error } = await admin
        .from("stores")
        .select("*")
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return (data as Store | null) ?? null;
    },

    async findMatchingOrphanStore(input): Promise<Store | null> {
      if (!input.storeName) return null;
      const { data: stores, error } = await admin
        .from("stores")
        .select("*")
        .ilike("name", input.storeName);
      if (error || !stores || stores.length === 0) return null;

      for (const candidate of stores) {
        const { count } = await admin
          .from("store_users")
          .select("id", { count: "exact", head: true })
          .eq("store_id", candidate.id);
        if ((count ?? 0) === 0) {
          if (!input.contactPhone || !candidate.contact_phone || candidate.contact_phone === input.contactPhone) {
            return candidate as Store;
          }
        }
      }
      return null;
    },

    async insertStore(input): Promise<Store> {
      const { data, error } = await admin
        .from("stores")
        .insert({
          name: input.name,
          address: input.address,
          contact_phone: input.contact_phone,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Store;
    },

    async insertStoreUser(input): Promise<StoreUser> {
      const { data, error } = await admin
        .from("store_users")
        .insert({
          store_id: input.store_id,
          auth_user_id: input.auth_user_id,
          email: input.email,
          role: input.role,
        })
        .select("*")
        .maybeSingle();

      if (error || !data) {
        const { data: raced, error: retryErr } = await admin
          .from("store_users")
          .select("*")
          .eq("auth_user_id", input.auth_user_id)
          .maybeSingle();
        if (retryErr) throw retryErr;
        if (raced) return raced as StoreUser;
        throw error ?? new Error("Failed to insert store_users row.");
      }

      return data as StoreUser;
    },

    async isSuperAdmin(userId: string): Promise<boolean> {
      const { data } = await admin
        .from("super_admins")
        .select("user_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      return Boolean(data);
    },

    async setAuthAppMetadataRole(userId: string, role: UserRole): Promise<void> {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { role },
      });
      if (error) throw error;
    },
  };
}

export async function reconcileUserAccountServer(
  user: AuthUserLike,
  options: {
    fallbackFullName?: string | null;
    fallbackPhone?: string | null;
    fallbackStoreName?: string | null;
    fallbackStoreAddress?: string | null;
    fallbackStorePhone?: string | null;
  } = {},
): Promise<ReconciledAccountResult> {
  const repo = createSupabaseReconcileRepository();
  return reconcileAuthenticatedAccount(user, repo, options);
}
