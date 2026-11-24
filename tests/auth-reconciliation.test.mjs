import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractAuthMetadata,
  reconcileAuthenticatedAccount,
  resolveCanonicalRole,
} from "../lib/auth/reconcile.ts";

function createInMemoryAuthRepository(initial = {}) {
  const profiles = new Map((initial.profiles ?? []).map((p) => [p.id, { ...p }]));
  const workers = new Map((initial.workers ?? []).map((w) => [w.id, { ...w }]));
  const stores = new Map((initial.stores ?? []).map((s) => [s.id, { ...s }]));
  const storeUsers = new Map((initial.storeUsers ?? []).map((su) => [su.id, { ...su }]));
  const superAdmins = new Set(initial.superAdmins ?? []);
  const appMetaUpdates = [];

  let nextWorkerNum = workers.size + 1;
  let nextStoreNum = stores.size + 1;
  let nextStoreUserNum = storeUsers.size + 1;

  const repo = {
    async getProfileById(userId) {
      return profiles.get(userId) ?? null;
    },
    async upsertProfile(input) {
      const existing = profiles.get(input.id);
      const saved = {
        id: input.id,
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        avatar_url: existing?.avatar_url ?? null,
        created_at: existing?.created_at ?? input.updated_at,
        updated_at: input.updated_at,
      };
      profiles.set(input.id, saved);
      return saved;
    },
    async getWorkerByAuthUserId(userId) {
      for (const w of workers.values()) {
        if (w.auth_user_id === userId) return { ...w };
      }
      return null;
    },
    async getUnlinkedWorkerByEmail(email) {
      for (const w of workers.values()) {
        if (!w.auth_user_id && (w.email ?? "").toLowerCase() === email.toLowerCase()) {
          return { ...w };
        }
      }
      return null;
    },
    async linkWorkerToAuthUser(workerId, input) {
      const existing = workers.get(workerId);
      const updated = {
        ...existing,
        auth_user_id: input.auth_user_id,
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        updated_at: input.updated_at,
      };
      workers.set(workerId, updated);
      return { ...updated };
    },
    async insertWorker(input) {
      for (const w of workers.values()) {
        if (w.auth_user_id === input.auth_user_id) return { ...w };
      }
      const id = `worker-auto-${nextWorkerNum++}`;
      const row = {
        id,
        auth_user_id: input.auth_user_id,
        memberstack_id: null,
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        created_at: "2026-11-25T00:00:00.000Z",
      };
      workers.set(id, row);
      return { ...row };
    },
    async getStoreUserByAuthUserId(userId) {
      for (const su of storeUsers.values()) {
        if (su.auth_user_id === userId) return { ...su };
      }
      return null;
    },
    async getUnlinkedStoreUserByEmail(email) {
      for (const su of storeUsers.values()) {
        if (!su.auth_user_id && (su.email ?? "").toLowerCase() === email.toLowerCase()) {
          return { ...su };
        }
      }
      return null;
    },
    async linkStoreUserToAuthUser(storeUserId, input) {
      const existing = storeUsers.get(storeUserId);
      const updated = {
        ...existing,
        auth_user_id: input.auth_user_id,
        email: input.email,
        updated_at: input.updated_at,
      };
      storeUsers.set(storeUserId, updated);
      return { ...updated };
    },
    async getStoreById(storeId) {
      return stores.get(storeId) ?? null;
    },
    async findMatchingOrphanStore(input) {
      if (!input.storeName) return null;
      for (const s of stores.values()) {
        if ((s.name ?? "").toLowerCase() === input.storeName.toLowerCase()) {
          const hasOwner = [...storeUsers.values()].some((su) => su.store_id === s.id);
          if (!hasOwner) return { ...s };
        }
      }
      return null;
    },
    async insertStore(input) {
      const id = `store-auto-${nextStoreNum++}`;
      const row = {
        id,
        name: input.name,
        address: input.address,
        contact_phone: input.contact_phone,
        logo_url: null,
        created_at: "2026-11-25T00:00:00.000Z",
      };
      stores.set(id, row);
      return { ...row };
    },
    async insertStoreUser(input) {
      for (const su of storeUsers.values()) {
        if (su.auth_user_id === input.auth_user_id) return { ...su };
      }
      const id = `store-user-auto-${nextStoreUserNum++}`;
      const row = {
        id,
        store_id: input.store_id,
        auth_user_id: input.auth_user_id,
        email: input.email,
        role: input.role,
        memberstack_id: null,
        created_at: "2026-11-25T00:00:00.000Z",
      };
      storeUsers.set(id, row);
      return { ...row };
    },
    async isSuperAdmin(userId) {
      return superAdmins.has(userId);
    },
    async setAuthAppMetadataRole(userId, role) {
      appMetaUpdates.push({ userId, role });
    },
  };

  return {
    repo,
    profiles,
    workers,
    stores,
    storeUsers,
    appMetaUpdates,
  };
}

test("1. Existing Worker with missing profiles/workers rows (e.g. ayush.t@tempest.house) logs in and auto-repairs without 'Please sign up first'", async () => {
  const state = createInMemoryAuthRepository();
  const ayushTempestUser = {
    id: "2ee9c23c-276a-4c37-bc99-a2033466522a",
    email: "ayush.t@tempest.house",
    app_metadata: { provider: "email", providers: ["email"], role: "worker" },
    user_metadata: {
      email: "ayush.t@tempest.house",
      email_verified: true,
      full_name: "Siya- Account-Worker",
      phone: "8219743301",
      role: "worker",
    },
  };

  const firstLogin = await reconcileAuthenticatedAccount(ayushTempestUser, state.repo);
  assert.equal(firstLogin.role, "worker");
  assert.equal(firstLogin.repairedProfile, true);
  assert.equal(firstLogin.repairedWorker, true);
  assert.equal(firstLogin.profile?.id, ayushTempestUser.id);
  assert.equal(firstLogin.profile?.role, "worker");
  assert.equal(firstLogin.profile?.full_name, "Siya- Account-Worker");
  assert.equal(firstLogin.profile?.phone, "8219743301");
  assert.equal(firstLogin.worker?.auth_user_id, ayushTempestUser.id);
  assert.equal(state.profiles.size, 1);
  assert.equal(state.workers.size, 1);

  // Subsequent login after logout / fresh browser session 5 days later is idempotent and creates no duplicates
  const secondLogin = await reconcileAuthenticatedAccount(ayushTempestUser, state.repo);
  assert.equal(secondLogin.role, "worker");
  assert.equal(secondLogin.repairedProfile, false);
  assert.equal(secondLogin.repairedWorker, false);
  assert.equal(state.profiles.size, 1);
  assert.equal(state.workers.size, 1);
  assert.equal(secondLogin.worker?.id, firstLogin.worker?.id);
});

test("2. Worker with existing workers row but missing profiles row (e.g. ayush@revenifynow.com) repairs profile even when provisionWorker runs", async () => {
  const userId = "c815fd68-2436-4195-a180-cb15e4314a8d";
  const state = createInMemoryAuthRepository({
    workers: [
      {
        id: "c99cc4ff-c1e5-4a67-9295-93f9fd773561",
        auth_user_id: userId,
        full_name: "Ayush Thakur",
        email: "ayush@revenifynow.com",
        phone: "123456789",
      },
    ],
  });

  const user = {
    id: userId,
    email: "ayush@revenifynow.com",
    app_metadata: { role: "worker" },
    user_metadata: { full_name: "Ayush Thakur", phone: "123456789", role: "worker" },
  };

  const result = await reconcileAuthenticatedAccount(user, state.repo);
  assert.equal(result.role, "worker");
  assert.equal(result.repairedProfile, true);
  assert.equal(result.repairedWorker, false);
  assert.equal(result.profile?.id, userId);
  assert.equal(result.profile?.role, "worker");
  assert.equal(result.worker?.id, "c99cc4ff-c1e5-4a67-9295-93f9fd773561");
  assert.equal(state.workers.size, 1);
});

test("3. Existing Retailer with missing profiles/store_users/stores rows repairs cleanly and never duplicates on subsequent logins", async () => {
  const userId = "1bf0f4dc-9c19-4cce-9ff1-7a8e53869568";
  const state = createInMemoryAuthRepository();
  const retailerUser = {
    id: userId,
    email: "rudi.van.boven@vanderlande.com",
    app_metadata: { role: "retailer" },
    user_metadata: {
      email: "rudi.van.boven@vanderlande.com",
      full_name: "RUDI VAN BOVEN",
      phone: "4243505134",
      role: "retailer",
      store_name: "shiftsupport",
    },
  };

  const first = await reconcileAuthenticatedAccount(retailerUser, state.repo);
  assert.equal(first.role, "retailer");
  assert.equal(first.repairedProfile, true);
  assert.equal(first.repairedRetailer, true);
  assert.equal(first.profile?.role, "retailer");
  assert.equal(first.store?.name, "shiftsupport");
  assert.equal(first.storeUser?.store_id, first.store?.id);
  assert.equal(first.storeUser?.auth_user_id, userId);
  assert.equal(state.profiles.size, 1);
  assert.equal(state.stores.size, 1);
  assert.equal(state.storeUsers.size, 1);

  // Logging out and logging back in days later must reuse the exact same store and store_users row
  const second = await reconcileAuthenticatedAccount(retailerUser, state.repo);
  assert.equal(second.role, "retailer");
  assert.equal(second.repairedProfile, false);
  assert.equal(second.repairedRetailer, false);
  assert.equal(second.store?.id, first.store?.id);
  assert.equal(second.storeUser?.id, first.storeUser?.id);
  assert.equal(state.stores.size, 1);
  assert.equal(state.storeUsers.size, 1);
});

test("4. Retailer account whose profile row was wrongly defaulted to 'worker' by a database trigger is corrected to 'retailer'", async () => {
  const userId = "retailer-trigger-victim";
  const state = createInMemoryAuthRepository({
    profiles: [
      {
        id: userId,
        full_name: "Store Owner",
        email: "owner@store.test",
        phone: "5551234567",
        role: "worker", // wrongly set by an auth.users trigger before provisionRetailer ran
      },
    ],
  });

  const user = {
    id: userId,
    email: "owner@store.test",
    app_metadata: {},
    user_metadata: {
      full_name: "Store Owner",
      phone: "5551234567",
      role: "retailer",
      store_name: "Downtown Market",
    },
  };

  const reconciled = await reconcileAuthenticatedAccount(user, state.repo);
  assert.equal(reconciled.role, "retailer");
  assert.equal(reconciled.profile?.role, "retailer");
  assert.equal(reconciled.store?.name, "Downtown Market");
  assert.equal(reconciled.storeUser?.auth_user_id, userId);
  assert.equal(state.workers.size, 0);
  assert.deepEqual(state.appMetaUpdates, [{ userId, role: "retailer" }]);
});

test("5. Dedicated Super Admin operations account stays strictly separated even if a trigger left profile.role='worker' or app_metadata.role='worker'", async () => {
  const adminUserId = "1f77befb-5068-4728-8cc5-336cca85b9c6";
  const state = createInMemoryAuthRepository({
    superAdmins: [adminUserId],
    profiles: [
      {
        id: adminUserId,
        full_name: null,
        email: "thakurishu458@gmail.com",
        phone: null,
        role: "worker", // created by default trigger on auth.users
      },
    ],
  });

  const adminUser = {
    id: adminUserId,
    email: "thakurishu458@gmail.com",
    app_metadata: { role: "worker" },
    user_metadata: {},
  };

  const reconciled = await reconcileAuthenticatedAccount(adminUser, state.repo);
  assert.equal(reconciled.isSuperAdmin, true);
  assert.equal(reconciled.role, null);
  assert.equal(reconciled.repairedWorker, false);
  assert.equal(reconciled.repairedRetailer, false);
  assert.equal(state.workers.size, 0);
  assert.equal(state.storeUsers.size, 0);
});

test("6. Truly unprovisioned Auth user with no records and no role metadata returns role=null", async () => {
  const state = createInMemoryAuthRepository();
  const emptyUser = {
    id: "unprovisioned-1",
    email: "mystery@example.com",
    app_metadata: {},
    user_metadata: {},
  };

  const reconciled = await reconcileAuthenticatedAccount(emptyUser, state.repo);
  assert.equal(reconciled.role, null);
  assert.equal(reconciled.isSuperAdmin, false);
  assert.equal(state.profiles.size, 0);
  assert.equal(state.workers.size, 0);
  assert.equal(state.storeUsers.size, 0);
});

test("7. Auth actions, session guards, callback route, reset-password page, and migration 0020 integration", async () => {
  const [authAction, sessionFile, callbackRoute, resetPage, migration0020] =
    await Promise.all([
      readFile(new URL("../app/actions/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth/session.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/reset-password/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../supabase/migrations/0020_auth_profile_reconciliation.sql", import.meta.url),
        "utf8",
      ),
    ]);

  // 1. provisionWorker upserts profile BEFORE checking existing worker row
  const upsertIdx = authAction.indexOf('admin.from("profiles").upsert');
  const workerLookupIdx = authAction.indexOf('.from("workers")');
  assert.ok(upsertIdx > -1 && workerLookupIdx > -1 && upsertIdx < workerLookupIdx);

  // 2. signIn calls reconcileUserAccountServer before returning "This account isn't set up yet"
  assert.match(
    authAction,
    /reconcileUserAccountServer\(data\.user[\s\S]*?This account isn't set up yet\. Please sign up first\./,
  );

  // 3. continuePathFor after password reset reconciles the account
  assert.match(
    authAction,
    /async function continuePathFor[\s\S]*?reconcileUserAccountServer\(user\)/,
  );

  // 4. session.ts getProfile, requireWorker, and requireRetailer all reconcile before failing
  assert.match(sessionFile, /getProfile[\s\S]*?reconcileUserAccountServer\(user\)/);
  assert.match(sessionFile, /requireWorker[\s\S]*?reconcileUserAccountServer\(user\)/);
  assert.match(sessionFile, /requireRetailer[\s\S]*?reconcileUserAccountServer\(user\)/);

  // 5. /auth/callback handles both PKCE code and token_hash recovery/confirmation links using forwarded host
  assert.match(callbackRoute, /resolveRedirectBase/);
  assert.match(callbackRoute, /token_hash/);
  assert.match(callbackRoute, /exchangeCodeForSession/);
  assert.match(callbackRoute, /verifyOtp/);

  // 6. /reset-password handles ?code=... and ?token_hash=... cleanly
  assert.match(resetPage, /if \(params\.code && !hasError\)/);
  assert.match(resetPage, /params\.token_hash/);

  // 7. Migration 0020 creates trigger and backfills profiles, workers, stores, store_users, and protects reminder due dates
  assert.match(migration0020, /create trigger on_auth_user_created_profile/i);
  assert.match(migration0020, /insert into public\.profiles/i);
  assert.match(migration0020, /insert into public\.workers/i);
  assert.match(migration0020, /insert into public\.store_users/i);
  assert.match(migration0020, /v_reconcile_time \+ interval '14 days'/i);
  assert.match(migration0020, /not exists \(select 1 from public\.super_admins sa where sa\.user_id = u\.id and sa\.status = 'active'\)/i);
});
