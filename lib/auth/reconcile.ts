import type { Profile, PublicWorker, Store, StoreUser, UserRole } from "@/lib/supabase/types";

export interface AuthUserLike {
  id: string;
  email?: string | null;
  created_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ReconcileRepository {
  getProfileById(userId: string): Promise<Profile | null>;
  upsertProfile(input: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: UserRole;
    updated_at: string;
  }): Promise<Profile>;
  getWorkerByAuthUserId(userId: string): Promise<PublicWorker | null>;
  getUnlinkedWorkerByEmail(email: string): Promise<PublicWorker | null>;
  linkWorkerToAuthUser(workerId: string, input: {
    auth_user_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    updated_at: string;
  }): Promise<PublicWorker>;
  insertWorker(input: {
    auth_user_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  }): Promise<PublicWorker>;
  getStoreUserByAuthUserId(userId: string): Promise<StoreUser | null>;
  getUnlinkedStoreUserByEmail(email: string): Promise<StoreUser | null>;
  linkStoreUserToAuthUser(storeUserId: string, input: {
    auth_user_id: string;
    email: string | null;
    updated_at: string;
  }): Promise<StoreUser>;
  getStoreById(storeId: string): Promise<Store | null>;
  findMatchingOrphanStore(input: {
    storeName: string | null;
    contactPhone: string | null;
  }): Promise<Store | null>;
  insertStore(input: {
    name: string;
    address: string | null;
    contact_phone: string | null;
  }): Promise<Store>;
  insertStoreUser(input: {
    store_id: string;
    auth_user_id: string;
    email: string | null;
    role: string;
  }): Promise<StoreUser>;
  isSuperAdmin(userId: string): Promise<boolean>;
  setAuthAppMetadataRole(userId: string, role: UserRole): Promise<void>;
}

export interface ReconciledAccountResult {
  role: UserRole | null;
  profile: Profile | null;
  worker: PublicWorker | null;
  storeUser: StoreUser | null;
  store: Store | null;
  isSuperAdmin: boolean;
  repairedProfile: boolean;
  repairedWorker: boolean;
  repairedRetailer: boolean;
  repairedAppMetadata: boolean;
}

function cleanText(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRole(val: unknown): UserRole | null {
  if (val === "worker" || val === "retailer" || val === "admin") {
    return val;
  }
  return null;
}

export function extractAuthMetadata(user: AuthUserLike): {
  email: string | null;
  fullName: string | null;
  phone: string | null;
  storeName: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  appMetaRole: UserRole | null;
  userMetaRole: UserRole | null;
} {
  const userMeta = user.user_metadata ?? {};
  const appMeta = user.app_metadata ?? {};
  const email = cleanText(user.email)?.toLowerCase() ?? cleanText(userMeta.email)?.toLowerCase() ?? null;
  const fullName = cleanText(userMeta.full_name) ?? cleanText(userMeta.name) ?? null;
  const phone = cleanText(userMeta.phone) ?? null;
  const storeName = cleanText(userMeta.store_name) ?? cleanText(userMeta.storeName) ?? null;
  const storeAddress = cleanText(userMeta.store_address) ?? cleanText(userMeta.storeAddress) ?? null;
  const storePhone = cleanText(userMeta.store_phone) ?? cleanText(userMeta.storePhone) ?? phone;

  return {
    email,
    fullName,
    phone,
    storeName,
    storeAddress,
    storePhone,
    appMetaRole: parseRole(appMeta.role),
    userMetaRole: parseRole(userMeta.role),
  };
}

/**
 * Resolves the authoritative role for an authenticated Supabase user across:
 *   1. Dedicated Super Admin separation (`super_admins` without worker/store records)
 *   2. Explicit role in `public.profiles.role` (unless it's a default trigger `'worker'`
 *      row on an account that actually owns a `store_users` row or retailer metadata)
 *   3. Existing `public.store_users` or `public.workers` row
 *   4. `user.app_metadata.role` (server-signed in JWT)
 *   5. `user.user_metadata.role` (written at `supabase.auth.signUp()`)
 */
export function resolveCanonicalRole(input: {
  user: AuthUserLike;
  profile: Profile | null;
  worker: PublicWorker | null;
  storeUser: StoreUser | null;
  isSuperAdmin: boolean;
}): UserRole | null {
  const meta = extractAuthMetadata(input.user);

  // If the account has a store_users record, it is definitively a retailer.
  if (input.storeUser) return "retailer";

  // If the account has a workers record, it is definitively a worker.
  if (input.worker) return "worker";

  // Super Admin accounts are kept strictly separate from Worker and Retailer accounts
  // (migration 0011): an active Super Admin without an actual `workers` or `store_users`
  // record is never provisioned as a worker or retailer, even if an earlier trigger
  // or metadata stamp left `role = 'worker'` on their profile or auth metadata.
  if (input.isSuperAdmin) {
    return input.profile?.role === "admin" ? "admin" : null;
  }

  // If app_metadata or user_metadata explicitly says retailer (e.g., a trigger created
  // a default 'worker' profile row before provisionRetailer ran), honour 'retailer'.
  if (meta.appMetaRole === "retailer" || meta.userMetaRole === "retailer" || meta.storeName) {
    return "retailer";
  }

  if (input.profile?.role === "retailer" || input.profile?.role === "worker") {
    return input.profile.role;
  }

  if (meta.appMetaRole === "worker" || meta.userMetaRole === "worker") {
    return "worker";
  }

  if (input.profile?.role === "admin") {
    return "admin";
  }

  return null;
}

/**
 * Idempotently reconciles and repairs an authenticated user's application records
 * (`profiles`, `workers`, `stores`, `store_users`, and `app_metadata.role`).
 *
 * Guarantees that any existing user who previously signed up (and has their role
 * in `profiles`, `workers`, `store_users`, `app_metadata`, or `user_metadata`)
 * has their missing profile/worker/retailer records seamlessly restored without
 * ever creating duplicates or asking them to sign up again.
 */
export async function reconcileAuthenticatedAccount(
  user: AuthUserLike,
  repo: ReconcileRepository,
  options: {
    now?: Date;
    fallbackFullName?: string | null;
    fallbackPhone?: string | null;
    fallbackStoreName?: string | null;
    fallbackStoreAddress?: string | null;
    fallbackStorePhone?: string | null;
  } = {},
): Promise<ReconciledAccountResult> {
  const nowIso = (options.now ?? new Date()).toISOString();
  const meta = extractAuthMetadata(user);

  const email = meta.email;
  let [profile, worker, storeUser, isSuperAdmin] = await Promise.all([
    repo.getProfileById(user.id),
    repo.getWorkerByAuthUserId(user.id),
    repo.getStoreUserByAuthUserId(user.id),
    repo.isSuperAdmin(user.id),
  ]);

  let repairedProfile = false;
  let repairedWorker = false;
  let repairedRetailer = false;
  let repairedAppMetadata = false;

  // Check if there is an unlinked legacy worker or store_user row with the exact email
  // (never link a dedicated Super Admin account to a worker or retailer row)
  if (!isSuperAdmin && !worker && email && !storeUser && meta.appMetaRole !== "retailer" && meta.userMetaRole !== "retailer") {
    const unlinkedWorker = await repo.getUnlinkedWorkerByEmail(email);
    if (unlinkedWorker) {
      worker = await repo.linkWorkerToAuthUser(unlinkedWorker.id, {
        auth_user_id: user.id,
        full_name:
          cleanText(options.fallbackFullName) ??
          cleanText(unlinkedWorker.full_name) ??
          cleanText(profile?.full_name) ??
          meta.fullName,
        email,
        phone:
          cleanText(options.fallbackPhone) ??
          cleanText(profile?.phone) ??
          meta.phone,
        updated_at: nowIso,
      });
      repairedWorker = true;
    }
  }

  if (!isSuperAdmin && !storeUser && email && !worker && meta.appMetaRole !== "worker" && meta.userMetaRole !== "worker") {
    const unlinkedStoreUser = await repo.getUnlinkedStoreUserByEmail(email);
    if (unlinkedStoreUser) {
      storeUser = await repo.linkStoreUserToAuthUser(unlinkedStoreUser.id, {
        auth_user_id: user.id,
        email,
        updated_at: nowIso,
      });
      repairedRetailer = true;
    }
  }

  const role = resolveCanonicalRole({
    user,
    profile,
    worker,
    storeUser,
    isSuperAdmin,
  });

  if (!role) {
    return {
      role: null,
      profile,
      worker,
      storeUser,
      store: null,
      isSuperAdmin,
      repairedProfile: false,
      repairedWorker: false,
      repairedRetailer: false,
      repairedAppMetadata: false,
    };
  }

  const resolvedFullName =
    cleanText(options.fallbackFullName) ??
    cleanText(profile?.full_name) ??
    cleanText(worker?.full_name) ??
    meta.fullName ??
    (email ? email.split("@")[0] ?? "Member" : "Member");

  const resolvedPhone =
    cleanText(options.fallbackPhone) ??
    cleanText(profile?.phone) ??
    meta.phone ??
    null;

  // 1. Ensure `public.profiles` row exists and has the canonical role & details
  const needsProfileUpsert =
    !profile ||
    profile.role !== role ||
    (!cleanText(profile.email) && Boolean(email)) ||
    (!cleanText(profile.full_name) && Boolean(resolvedFullName)) ||
    (!cleanText(profile.phone) && Boolean(resolvedPhone));

  if (needsProfileUpsert && (role === "worker" || role === "retailer")) {
    profile = await repo.upsertProfile({
      id: user.id,
      full_name: resolvedFullName,
      email: cleanText(profile?.email) ?? email,
      phone: resolvedPhone,
      role,
      updated_at: nowIso,
    });
    repairedProfile = true;
  }

  // 2. If role === 'worker', ensure `public.workers` row exists
  if (role === "worker" && !worker) {
    worker = await repo.insertWorker({
      auth_user_id: user.id,
      full_name: resolvedFullName,
      email,
      phone: resolvedPhone,
    });
    repairedWorker = true;
  }

  // 3. If role === 'retailer', ensure `public.store_users` and `public.stores` rows exist
  let store: Store | null = null;
  if (role === "retailer") {
    if (storeUser?.store_id) {
      store = await repo.getStoreById(storeUser.store_id);
    }

    const desiredStoreName =
      cleanText(options.fallbackStoreName) ??
      meta.storeName ??
      (resolvedFullName ? `${resolvedFullName}'s Store` : "Retailer Store");
    const desiredStoreAddress =
      cleanText(options.fallbackStoreAddress) ??
      meta.storeAddress ??
      null;
    const desiredStorePhone =
      cleanText(options.fallbackStorePhone) ??
      meta.storePhone ??
      resolvedPhone ??
      null;

    if (!store) {
      store = await repo.findMatchingOrphanStore({
        storeName: cleanText(options.fallbackStoreName) ?? meta.storeName,
        contactPhone: desiredStorePhone,
      });
    }

    if (!store) {
      store = await repo.insertStore({
        name: desiredStoreName,
        address: desiredStoreAddress,
        contact_phone: desiredStorePhone,
      });
      repairedRetailer = true;
    }

    if (!storeUser) {
      storeUser = await repo.insertStoreUser({
        store_id: store.id,
        auth_user_id: user.id,
        email,
        role: "owner",
      });
      repairedRetailer = true;
    }
  }

  // 4. Keep `auth.users.raw_app_meta_data.role` in sync with canonical role
  if ((role === "worker" || role === "retailer") && meta.appMetaRole !== role) {
    try {
      await repo.setAuthAppMetadataRole(user.id, role);
      repairedAppMetadata = true;
    } catch {
      // Non-fatal if Auth Admin API is temporarily rate-limited
    }
  }

  return {
    role,
    profile,
    worker,
    storeUser,
    store,
    isSuperAdmin,
    repairedProfile,
    repairedWorker,
    repairedRetailer,
    repairedAppMetadata,
  };
}
