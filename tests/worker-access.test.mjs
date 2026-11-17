import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveWorkerSignupMode,
  workerCheckoutEnabled,
  workerHasAccessInMode,
} from "../lib/worker-access.ts";

const now = Date.parse("2026-11-18T00:00:00.000Z");

test("free mode is the safe default and grants new inactive workers access", () => {
  assert.equal(resolveWorkerSignupMode(undefined), "free");
  assert.equal(workerHasAccessInMode("free", "inactive", null, now), true);
});

test("existing inactive and expired workers get access in free mode without stored-state mutation", () => {
  const records = [
    { membership_status: "inactive", membership_expires_at: null },
    { membership_status: "active", membership_expires_at: "2026-11-01T00:00:00Z" },
  ];
  assert.equal(workerHasAccessInMode("free", records[0].membership_status, records[0].membership_expires_at, now), true);
  assert.equal(workerHasAccessInMode("free", records[1].membership_status, records[1].membership_expires_at, now), true);
  assert.deepEqual(records[0], { membership_status: "inactive", membership_expires_at: null });
  assert.deepEqual(records[1], { membership_status: "active", membership_expires_at: "2026-11-01T00:00:00Z" });
});

test("paid mode retains existing active, past-due grace, and inactive rules", () => {
  assert.equal(workerHasAccessInMode("paid", "inactive", null, now), false);
  assert.equal(workerHasAccessInMode("paid", "active", null, now), true);
  assert.equal(workerHasAccessInMode("paid", "past_due", "2026-12-01T00:00:00Z", now), true);
  assert.equal(workerHasAccessInMode("paid", "active", "2026-11-01T00:00:00Z", now), false);
});

test("Free Mode disables membership checkout; existing $18 subscription mode stays opt-in", () => {
  assert.equal(resolveWorkerSignupMode("paid"), "paid");
  assert.equal(workerCheckoutEnabled("free", "true"), false);
  assert.equal(workerCheckoutEnabled("paid", undefined), false);
  assert.equal(workerCheckoutEnabled("paid", "TRUE"), false);
  assert.equal(workerCheckoutEnabled("paid", "true"), true);
});

test("signup does not start membership checkout and pricing shows Free Access", async () => {
  const [signupPage, authAction, pricing, membershipActions, billing] = await Promise.all([
    readFile(new URL("../app/worker/(auth)/signup/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/actions/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/pricing/PricingPayments.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/pricing/MembershipActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/actions/billing.ts", import.meta.url), "utf8"),
  ]);
  assert.match(signupPage, /isWorkerSignupFreeMode\(\)/);
  assert.doesNotMatch(authAction, /startMembershipCheckout/);
  assert.match(pricing, /Free Access/);
  assert.match(pricing, /amount="Free"/);
  assert.match(pricing, /showStart=\{!freeMode\}/);
  assert.match(membershipActions, /showStart && checkoutAvailable/);
  assert.match(billing, /if \(!isWorkerSignupCheckoutEnabled\(\)\)/);
  assert.match(billing, /mode: "subscription"/);
  assert.match(billing, /membershipPriceId\(\)/);
});

test("inactive worker can browse shifts and the action calls the restricted RPC in Free Mode", async () => {
  const [membership, available, dashboard, action, rpc, coreSchema] = await Promise.all([
    readFile(new URL("../lib/membership.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/worker/(app)/available-shifts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/worker/(app)/dashboard/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/actions/applications.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0015_apply_for_shift_free_mode.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0001_supabase_auth_architecture.sql", import.meta.url), "utf8"),
  ]);

  assert.match(membership, /active: workerHasAccessInMode/);
  assert.match(membership, /freeMode \? "free" : "paid"/);
  assert.doesNotMatch(membership, /\.from\("workers"\)\s*\.update/);
  assert.match(available, /if \(!membership\.active\)/);
  assert.match(dashboard, /!membership\.active \?/);
  assert.match(action, /\.eq\("auth_user_id",\s*user\.id\)/);
  assert.match(action, /isWorkerSignupFreeMode\(\)/);
  assert.match(action, /createAdminClient\(\)\.rpc\("apply_for_shift_free_mode"/);
  assert.match(action, /p_worker_id:\s*worker\.id/);
  assert.match(action, /p_shift_id:\s*shiftId/);

  assert.match(rpc, /security\s+definer/i);
  assert.match(rpc, /set\s+search_path\s*=\s*''/i);
  assert.match(rpc, /revoke\s+all\s+on\s+function\s+public\.apply_for_shift_free_mode\(uuid,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(rpc, /grant\s+execute\s+on\s+function\s+public\.apply_for_shift_free_mode\(uuid,\s*uuid\)\s+to\s+service_role/i);
  assert.match(rpc, /for\s+update/i);
  assert.match(rpc, /s\.status\s*=\s*'open'/i);
  assert.match(rpc, /s\.accepted_by\s+is\s+null/i);
  assert.match(rpc, /s\.payment_status\s+in\s*\('paid',\s*'legacy'\)/i);
  assert.match(rpc, /insert\s+into\s+public\.shift_applications\s*\(shift_id,\s*worker_id,\s*status\)/i);
  assert.match(coreSchema, /on\s+public\.shift_applications\s*\(shift_id,\s*worker_id\)/i);
});

test("free-mode integration leaves Stripe webhook and historical payment paths in place", async () => {
  const [webhook, billing, fulfillment] = await Promise.all([
    readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/actions/billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/stripe/fulfillment.ts", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /applySubscription/);
  assert.match(webhook, /applyCheckoutSession/);
  assert.match(billing, /mode: "subscription"/);
  assert.match(fulfillment, /case CHECKOUT_KIND\.workerMembership:\s*return applyMembershipCheckout/);
  assert.match(fulfillment, /applySubscription/);
});
