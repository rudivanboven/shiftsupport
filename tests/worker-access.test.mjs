import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveWorkerSignupMode,
  workerCheckoutEnabled,
  workerHasAccessInMode,
} from "../lib/worker-access.ts";

const now = Date.parse("2026-11-12T00:00:00.000Z");

test("new signup keeps its inactive record but gets temporary free access", () => {
  assert.equal(resolveWorkerSignupMode(undefined), "free");
  assert.equal(workerHasAccessInMode("free", "inactive", null, now), true);
  assert.equal(workerHasAccessInMode("paid", "inactive", null, now), false);
});

test("existing inactive and expired workers get access only in free mode", () => {
  assert.equal(workerHasAccessInMode("free", "inactive", null, now), true);
  assert.equal(workerHasAccessInMode("free", "active", "2026-11-01T00:00:00.000Z", now), true);
  assert.equal(workerHasAccessInMode("paid", "active", "2026-11-01T00:00:00.000Z", now), false);
});

test("valid one-time paid workers retain permanent access in both modes", () => {
  // One-time payers are stored active with no expiry.
  assert.equal(workerHasAccessInMode("free", "active", null, now), true);
  assert.equal(workerHasAccessInMode("paid", "active", null, now), true);
});

test("valid legacy yearly subscribers remain governed by their stored period", () => {
  const periodEnd = "2026-12-01T00:00:00.000Z";
  assert.equal(workerHasAccessInMode("free", "active", periodEnd, now), true);
  assert.equal(workerHasAccessInMode("paid", "active", periodEnd, now), true);
  assert.equal(workerHasAccessInMode("paid", "past_due", periodEnd, now), true);
  assert.equal(workerHasAccessInMode("paid", "active", "2026-11-01T00:00:00.000Z", now), false);
});

test("switching back to paid mode removes only the temporary override", () => {
  const storedMembership = { status: "inactive", expiresAt: null };
  assert.equal(workerHasAccessInMode("free", storedMembership.status, storedMembership.expiresAt, now), true);
  assert.equal(workerHasAccessInMode("paid", storedMembership.status, storedMembership.expiresAt, now), false);
  assert.deepEqual(storedMembership, { status: "inactive", expiresAt: null });
});

test("only the explicit paid setting selects paid mode", () => {
  assert.equal(resolveWorkerSignupMode("paid"), "paid");
  assert.equal(resolveWorkerSignupMode(" FREE "), "free");
  assert.equal(resolveWorkerSignupMode("unexpected"), "free");
});

test("worker Checkout stays off in free mode and needs its explicit paid-mode switch", () => {
  assert.equal(workerCheckoutEnabled("free", "true"), false);
  assert.equal(workerCheckoutEnabled("paid", undefined), false);
  assert.equal(workerCheckoutEnabled("paid", "TRUE"), false);
  assert.equal(workerCheckoutEnabled("paid", "true"), true);
});

test("free-mode RPC is service-role-only and applies the same shift eligibility checks", async () => {
  const [rpc, coreSchema, appAction] = await Promise.all([
    readFile(new URL("../supabase/migrations/0015_apply_for_shift_free_mode.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0001_supabase_auth_architecture.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/actions/applications.ts", import.meta.url), "utf8"),
  ]);

  assert.match(rpc, /security\s+definer/i);
  assert.match(rpc, /set\s+search_path\s*=\s*''/i);
  assert.match(rpc, /revoke\s+all\s+on\s+function\s+public\.apply_for_shift_free_mode\(uuid,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(rpc, /grant\s+execute\s+on\s+function\s+public\.apply_for_shift_free_mode\(uuid,\s*uuid\)\s+to\s+service_role/i);
  assert.match(rpc, /for\s+update/i);
  assert.match(rpc, /s\.status\s*=\s*'open'/i);
  assert.match(rpc, /s\.accepted_by\s+is\s+null/i);
  assert.match(rpc, /s\.payment_status\s+in\s*\('paid',\s*'legacy'\)/i);
  assert.match(rpc, /insert\s+into\s+public\.shift_applications\s*\(shift_id,\s*worker_id,\s*status\)/i);
  assert.match(coreSchema, /shift_applications_shift_worker_key[\s\S]{0,120}on\s+public\.shift_applications\s*\(shift_id,\s*worker_id\)/i);
  assert.match(appAction, /\.eq\("auth_user_id",\s*user\.id\)/);
  assert.match(appAction, /const freeMode = isWorkerSignupFreeMode\(\);/);
  assert.match(appAction, /const \{ error \} = freeMode\s*\?\s*await createAdminClient\(\)\.rpc\("apply_for_shift_free_mode"/);
  assert.match(appAction, /p_worker_id:\s*worker\.id/);
});
