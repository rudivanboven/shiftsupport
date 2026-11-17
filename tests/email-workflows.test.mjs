import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createResendProvider } from "../lib/email/providers/resend.ts";
import {
  buildRetailerReminderEmail,
  buildRetailerWelcomeEmail,
  buildWorkerWelcomeEmail,
  createInMemoryWorkflowRepository,
  executeRetailerReminderJob,
  executeRetailerWelcomeEmail,
  executeWorkerWelcomeEmail,
  resolveGreetingFirstName,
  RETAILER_REMINDER_INTERVAL_MS,
} from "../lib/email/workflows.ts";

function createMockEmailEnvironment(options = { shouldFail: false }) {
  const sentMessages = [];
  let failFlag = Boolean(options.shouldFail);

  const provider = {
    id: "mock_resend",
    async send(message) {
      if (failFlag) {
        throw new Error("Simulated SMTP/API provider outage");
      }
      const id = `msg_${sentMessages.length + 1}`;
      sentMessages.push({ ...message, providerMessageId: id });
      return { providerMessageId: id };
    },
  };

  return {
    sentMessages,
    setShouldFail(next) {
      failFlag = Boolean(next);
    },
    getEmailProvider() {
      return {
        configured: true,
        provider,
        from: "ShiftSupport <noreply@shiftsupport.com>",
      };
    },
  };
}

const BASE_TIME = Date.parse("2026-11-01T10:00:00.000Z");
const daysAfter = (baseMs, days) =>
  new Date(baseMs + days * 24 * 60 * 60 * 1000);

test("1. New Worker signup -> receives one Worker Welcome Email (and never duplicates)", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "user-worker-1",
      workerId: "worker-1",
      role: "worker",
      email: "alex@worker.test",
      fullName: "Alex Doyle",
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const first = await executeWorkerWelcomeEmail(
    {
      userId: "user-worker-1",
      email: "alex@worker.test",
      fullName: "Alex Doyle",
      siteUrl: "https://shiftsupport.app",
      now: new Date(BASE_TIME),
    },
    deps,
  );

  assert.equal(first.ok, true);
  assert.equal(first.status, "sent");
  assert.equal(mail.sentMessages.length, 1);
  const msg = mail.sentMessages[0];
  assert.equal(msg.to, "alex@worker.test");
  assert.equal(msg.subject, "Welcome to ShiftSupport!");
  assert.match(msg.text, /Welcome to ShiftSupport! 🎉/);
  assert.match(msg.text, /Your ShiftSupport account has been created successfully\./);
  assert.match(
    msg.text,
    /There’s just one more step before you can start accepting shifts\. You’ll receive a separate invitation from ADP to complete your employee onboarding, including the information needed to set you up for payroll\./,
  );
  assert.match(
    msg.text,
    /Please complete your ADP onboarding as soon as you receive the invitation\./,
  );
  assert.match(
    msg.text,
    /Once your onboarding is complete, you’ll be ready to start picking up available shifts!/,
  );
  assert.match(msg.text, /Kind regards,\s+Rudi van Boven\s+Founder ShiftSupport/);
  assert.ok(msg.html.includes("https://shiftsupport.app/worker/dashboard"));
  assert.ok(msg.html.includes("https://shiftsupport.app/images/logobalck.png"));

  // Second call for the same worker must be blocked as a duplicate
  const second = await executeWorkerWelcomeEmail(
    {
      userId: "user-worker-1",
      email: "alex@worker.test",
      fullName: "Alex Doyle",
      siteUrl: "https://shiftsupport.app",
      now: new Date(BASE_TIME + 5000),
    },
    deps,
  );

  assert.equal(second.ok, true);
  assert.equal(second.status, "duplicate");
  assert.equal(mail.sentMessages.length, 1);
});

test("2. New Retailer signup -> receives one Retailer Welcome Email (and never duplicates)", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "user-retailer-1",
      storeId: "store-1",
      storeName: "Verhoeven Grocers",
      role: "retailer",
      email: "sam@verhoeven.test",
      fullName: "Sam Verhoeven",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const first = await executeRetailerWelcomeEmail(
    {
      userId: "user-retailer-1",
      storeId: "store-1",
      email: "sam@verhoeven.test",
      fullName: "Sam Verhoeven",
      storeName: "Verhoeven Grocers",
      siteUrl: "https://shiftsupport.app",
      now: new Date(BASE_TIME),
    },
    deps,
  );

  assert.equal(first.ok, true);
  assert.equal(first.status, "sent");
  assert.equal(mail.sentMessages.length, 1);
  assert.equal(
    store.getSchedule("store-1")?.nextReminderDueAt,
    new Date(BASE_TIME + RETAILER_REMINDER_INTERVAL_MS).toISOString(),
  );

  const msg = mail.sentMessages[0];
  assert.equal(msg.to, "sam@verhoeven.test");
  assert.equal(msg.subject, "Welcome to ShiftSupport!");
  assert.match(msg.text, /Welcome to ShiftSupport! 🎉/);
  assert.match(msg.text, /Your retailer account is ready\./);
  assert.match(
    msg.text,
    /Need an extra pair of hands\? Post your first shift and let local workers know when and where you need support\./,
  );
  assert.match(
    msg.text,
    /Simply add the date, time, location, role, and shift details, and ShiftSupport will take it from there\./,
  );
  assert.match(
    msg.text,
    /Thank you and Kind regards,\s+Rudi van Boven\s+Founder ShiftSupport/,
  );
  assert.ok(msg.html.includes("https://shiftsupport.app/retailer/shifts/new"));

  // Second attempt for the same retailer must be prevented
  const second = await executeRetailerWelcomeEmail(
    {
      userId: "user-retailer-1",
      storeId: "store-1",
      email: "sam@verhoeven.test",
      fullName: "Sam Verhoeven",
      siteUrl: "https://shiftsupport.app",
      now: new Date(BASE_TIME + 5000),
    },
    deps,
  );

  assert.equal(second.ok, true);
  assert.equal(second.status, "duplicate");
  assert.equal(mail.sentMessages.length, 1);
});

test("3 & 4. Role isolation: Worker never receives Retailer emails, and Retailer never receives Worker emails", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "user-worker-only",
      workerId: "worker-only",
      role: "worker",
      email: "worker@shiftsupport.test",
      fullName: "Taylor Worker",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
    {
      userId: "user-retailer-only",
      storeId: "store-only",
      role: "retailer",
      email: "retailer@shiftsupport.test",
      fullName: "Jordan Retailer",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  // Attempt to send Retailer Welcome Email to a Worker
  const retailerEmailToWorker = await executeRetailerWelcomeEmail(
    {
      userId: "user-worker-only",
      email: "worker@shiftsupport.test",
      fullName: "Taylor Worker",
      now: new Date(BASE_TIME),
    },
    deps,
  );
  assert.equal(retailerEmailToWorker.ok, false);
  assert.equal(retailerEmailToWorker.status, "skipped");
  assert.equal(retailerEmailToWorker.reason, "not_retailer");
  assert.equal(mail.sentMessages.length, 0);

  // Attempt to send Worker Welcome Email to a Retailer
  const workerEmailToRetailer = await executeWorkerWelcomeEmail(
    {
      userId: "user-retailer-only",
      email: "retailer@shiftsupport.test",
      fullName: "Jordan Retailer",
      now: new Date(BASE_TIME),
    },
    deps,
  );
  assert.equal(workerEmailToRetailer.ok, false);
  assert.equal(workerEmailToRetailer.status, "skipped");
  assert.equal(workerEmailToRetailer.reason, "not_worker");
  assert.equal(mail.sentMessages.length, 0);

  // Run the 14-day reminder job at Day 15: Worker must never receive a reminder
  const reminderRun = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 15), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(reminderRun.sent, 1);
  assert.equal(mail.sentMessages.length, 1);
  assert.equal(mail.sentMessages[0].to, "retailer@shiftsupport.test");
});

test("5 & 6. Retailer receives first reminder after 14 days and subsequent reminders at 14-day intervals", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "user-retailer-interval",
      storeId: "store-interval",
      role: "retailer",
      email: "sam@store.test",
      fullName: "Sam Verhoeven",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  // Day 0, Day 7, Day 13.9 -> not due yet
  for (const day of [0, 7, 13.9]) {
    const res = await executeRetailerReminderJob(
      { now: daysAfter(BASE_TIME, day), siteUrl: "https://shiftsupport.app" },
      deps,
    );
    assert.equal(res.sent, 0);
    assert.equal(res.notDue, 1);
  }
  assert.equal(mail.sentMessages.length, 0);

  // Day 14 -> First reminder sent
  const day14 = daysAfter(BASE_TIME, 14);
  const firstRun = await executeRetailerReminderJob(
    { now: day14, siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(firstRun.sent, 1);
  assert.equal(mail.sentMessages.length, 1);
  assert.equal(mail.sentMessages[0].subject, "Ready to post your first shift?");
  assert.match(mail.sentMessages[0].text, /^Hi Sam,/);
  assert.match(
    mail.sentMessages[0].text,
    /Just a quick reminder that your ShiftSupport account is ready whenever you need extra help\./,
  );
  assert.match(
    mail.sentMessages[0].text,
    /Whether it’s a call-out, busy period, weekend rush, or just a few extra hours of coverage, simply post a shift and let ShiftSupport help you fill the gap\./,
  );
  assert.match(mail.sentMessages[0].text, /Post your first shift today\./);
  assert.match(mail.sentMessages[0].text, /Best,\s+Rudi van Boven\s+ShiftSupport/);

  // Day 20 and Day 27 -> Not due for second reminder yet
  for (const day of [20, 27]) {
    const res = await executeRetailerReminderJob(
      { now: daysAfter(BASE_TIME, day), siteUrl: "https://shiftsupport.app" },
      deps,
    );
    assert.equal(res.sent, 0);
    assert.equal(res.notDue, 1);
  }
  assert.equal(mail.sentMessages.length, 1);

  // Day 28 (14 days after first reminder) -> Second reminder sent
  const secondRun = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 28), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(secondRun.sent, 1);
  assert.equal(mail.sentMessages.length, 2);

  // Day 42 (14 days after second reminder) -> Third reminder sent
  const thirdRun = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 42), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(thirdRun.sent, 1);
  assert.equal(mail.sentMessages.length, 3);
});

test("Existing retailer rollout reset preserves history and prevents catch-up sends", async () => {
  const rollout = new Date("2026-11-18T12:00:00.000Z");
  const newDue = new Date(rollout.getTime() + RETAILER_REMINDER_INTERVAL_MS).toISOString();
  const legacy = [
    { registeredAt: "2026-01-01T00:00:00.000Z", nextReminderDueAt: "2026-02-01T00:00:00.000Z", remindersSentCount: 0, lastReminderSentAt: null, firstShiftPostedAt: null, stoppedAt: null },
    { registeredAt: "2026-11-01T00:00:00.000Z", nextReminderDueAt: "2026-11-25T00:00:00.000Z", remindersSentCount: 2, lastReminderSentAt: "2026-11-11T00:00:00.000Z", firstShiftPostedAt: null, stoppedAt: null },
    { registeredAt: "2026-01-01T00:00:00.000Z", nextReminderDueAt: "2026-02-01T00:00:00.000Z", remindersSentCount: 1, lastReminderSentAt: "2026-01-15T00:00:00.000Z", firstShiftPostedAt: "2026-02-01T00:00:00.000Z", stoppedAt: "2026-02-01T00:00:00.000Z" },
    { registeredAt: "2026-01-01T00:00:00.000Z", nextReminderDueAt: "2026-02-01T00:00:00.000Z", remindersSentCount: 1, lastReminderSentAt: "2026-01-15T00:00:00.000Z", firstShiftPostedAt: null, stoppedAt: "2026-02-01T00:00:00.000Z" },
  ];
  const reset = legacy.map((schedule) =>
    schedule.firstShiftPostedAt === null && schedule.stoppedAt === null
      ? { ...schedule, nextReminderDueAt: newDue }
      : { ...schedule },
  );

  // Old overdue and near-future due dates both move to rollout + 14 days.
  assert.equal(reset[0].nextReminderDueAt, newDue);
  assert.equal(reset[1].nextReminderDueAt, newDue);
  // Signup/reminder history stays intact; posted/stopped schedules are untouched.
  assert.equal(reset[1].registeredAt, legacy[1].registeredAt);
  assert.equal(reset[1].remindersSentCount, 2);
  assert.equal(reset[1].lastReminderSentAt, legacy[1].lastReminderSentAt);
  assert.equal(reset[2].nextReminderDueAt, legacy[2].nextReminderDueAt);
  assert.equal(reset[3].nextReminderDueAt, legacy[3].nextReminderDueAt);

  const store = createInMemoryWorkflowRepository([
    {
      userId: "legacy-retailer",
      storeId: "legacy-store",
      role: "retailer",
      email: "legacy@store.test",
      fullName: "Legacy Retailer",
      registeredAt: legacy[0].registeredAt,
      nextReminderDueAt: newDue,
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const beforeNewDue = await executeRetailerReminderJob(
    { now: new Date(rollout.getTime() + RETAILER_REMINDER_INTERVAL_MS - 1), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(beforeNewDue.sent, 0);
  assert.equal(beforeNewDue.notDue, 1);
  assert.equal(mail.sentMessages.length, 0);

  const atNewDue = await executeRetailerReminderJob(
    { now: new Date(newDue), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(atNewDue.sent, 1);
  assert.equal(mail.sentMessages.length, 1);
});

test("7. Retailer posts their first shift -> all future reminders stop immediately", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "retailer-early-poster",
      storeId: "store-early",
      role: "retailer",
      email: "early@store.test",
      fullName: "Eva Early",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
    {
      userId: "retailer-later-poster",
      storeId: "store-later",
      role: "retailer",
      email: "later@store.test",
      fullName: "Liam Later",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  // Store 1 posts its first shift on Day 3 (before any reminder is due)
  store.postShift("store-early", daysAfter(BASE_TIME, 3).toISOString());

  // At Day 14: only Store 2 receives Reminder #1; Store 1 is stopped
  const runDay14 = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 14), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(runDay14.sent, 1);
  assert.equal(runDay14.stopped, 1);
  assert.equal(mail.sentMessages.length, 1);
  assert.equal(mail.sentMessages[0].to, "later@store.test");

  // Store 2 posts its first shift on Day 18 (after Reminder #1)
  store.postShift("store-later", daysAfter(BASE_TIME, 18).toISOString());

  // At Day 28 and Day 42: neither store receives any further reminders
  const runDay28 = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 28), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(runDay28.sent, 0);
  assert.equal(runDay28.stopped, 2);

  const runDay42 = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 42), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(runDay42.sent, 0);
  assert.equal(runDay42.stopped, 2);
  assert.equal(mail.sentMessages.length, 1);
});

test("8. Running the scheduled process multiple times does not produce duplicate emails", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "retailer-dup-check",
      storeId: "store-dup-check",
      role: "retailer",
      email: "dup@store.test",
      fullName: "Nina Retailer",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const day14 = daysAfter(BASE_TIME, 14);

  // Run the job 4 times on Day 14 (including concurrent execution)
  const [run1, run2] = await Promise.all([
    executeRetailerReminderJob({ now: day14 }, deps),
    executeRetailerReminderJob({ now: day14 }, deps),
  ]);
  const run3 = await executeRetailerReminderJob(
    { now: new Date(day14.getTime() + 60_000) },
    deps,
  );

  assert.equal(run1.sent + run2.sent + run3.sent, 1);
  assert.equal(mail.sentMessages.length, 1);
});

test("9. Failed email delivery is logged and handled safely, and retries succeed on recovery", async () => {
  const store = createInMemoryWorkflowRepository([
    {
      userId: "retailer-retry",
      storeId: "store-retry",
      role: "retailer",
      email: "retry@store.test",
      fullName: "Rosa Retry",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment({ shouldFail: true });
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const day14 = daysAfter(BASE_TIME, 14);

  // First run at Day 14 fails because provider is down
  const failedRun = await executeRetailerReminderJob({ now: day14 }, deps);
  assert.equal(failedRun.sent, 0);
  assert.equal(failedRun.failed, 1);
  assert.equal(failedRun.errors.length, 1);
  assert.match(failedRun.errors[0].error, /Simulated SMTP\/API provider outage/);

  const deliveriesAfterFail = store.getDeliveries();
  assert.equal(deliveriesAfterFail.length, 1);
  assert.equal(deliveriesAfterFail[0].status, "failed");
  assert.equal(deliveriesAfterFail[0].attemptCount, 1);
  assert.equal(store.getSchedule("store-retry")?.remindersSentCount, 0);

  // Provider recovers 10 minutes later -> retry succeeds and sends Reminder #1
  mail.setShouldFail(false);
  const recoveryRun = await executeRetailerReminderJob(
    { now: new Date(day14.getTime() + 10 * 60 * 1000) },
    deps,
  );
  assert.equal(recoveryRun.sent, 1);
  assert.equal(recoveryRun.failed, 0);
  assert.equal(mail.sentMessages.length, 1);

  const deliveriesAfterRecovery = store.getDeliveries();
  assert.equal(deliveriesAfterRecovery.length, 1);
  assert.equal(deliveriesAfterRecovery[0].status, "sent");
  assert.equal(deliveriesAfterRecovery[0].attemptCount, 2);
  assert.equal(store.getSchedule("store-retry")?.remindersSentCount, 1);
});

test("10. Missing or blank first name uses clean fallback ('Hi there,') without breaking delivery", async () => {
  assert.equal(resolveGreetingFirstName(null), "there");
  assert.equal(resolveGreetingFirstName(undefined), "there");
  assert.equal(resolveGreetingFirstName(""), "there");
  assert.equal(resolveGreetingFirstName("   "), "there");
  assert.equal(resolveGreetingFirstName("owner@store.com"), "there");
  assert.equal(resolveGreetingFirstName("  Sam   Verhoeven "), "Sam");

  const store = createInMemoryWorkflowRepository([
    {
      userId: "retailer-no-name",
      storeId: "store-no-name",
      role: "retailer",
      email: "noname@store.test",
      fullName: "   ",
      registeredAt: new Date(BASE_TIME).toISOString(),
    },
  ]);
  const mail = createMockEmailEnvironment();
  const deps = { repo: store.repo, getEmailProvider: mail.getEmailProvider };

  const run = await executeRetailerReminderJob(
    { now: daysAfter(BASE_TIME, 14), siteUrl: "https://shiftsupport.app" },
    deps,
  );
  assert.equal(run.sent, 1);
  assert.equal(mail.sentMessages.length, 1);
  assert.match(mail.sentMessages[0].text, /^Hi there,/);
  assert.ok(!mail.sentMessages[0].text.includes("[First Name]"));
  assert.ok(!mail.sentMessages[0].html.includes("[First Name]"));
  assert.ok(mail.sentMessages[0].html.includes("Hi there,"));
});

test("11. Resend adapter sends HTML, plain-text, and Idempotency-Key header correctly", async () => {
  const requests = [];
  const adapter = createResendProvider({
    apiKey: "re_test_123456",
    apiUrl: "https://api.resend.com/emails",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: "re_msg_999" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const rendered = buildRetailerWelcomeEmail({ siteUrl: "https://shiftsupport.app" });
  const result = await adapter.send({
    from: "ShiftSupport <noreply@shiftsupport.com>",
    to: "owner@store.test",
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: { "Idempotency-Key": "retailer_welcome:user-1" },
  });

  assert.equal(result.providerMessageId, "re_msg_999");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(requests[0].init.headers.Authorization, "Bearer re_test_123456");
  assert.equal(
    requests[0].init.headers["Idempotency-Key"],
    "retailer_welcome:user-1",
  );

  const payload = JSON.parse(requests[0].init.body);
  assert.deepEqual(payload.to, ["owner@store.test"]);
  assert.equal(payload.subject, "Welcome to ShiftSupport!");
  assert.ok(payload.text.includes("Your retailer account is ready."));
  assert.ok(payload.html.includes("<!DOCTYPE html>"));
});

test("12. Source integration: auth signup, shift creation, cron route, and SQL migration guards", async () => {
  const [authAction, shiftsAction, cronRoute, vercelConfig, migrationSql, rolloutMigration, serverCode] =
    await Promise.all([
      readFile(new URL("../app/actions/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/shifts.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../app/api/cron/retailer-reminders/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../vercel.json", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/0016_automated_email_workflows.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../supabase/migrations/0017_reset_retailer_reminder_rollout.sql", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/email/server.ts", import.meta.url), "utf8"),
    ]);

  // Welcome emails are called only after provisionWorker / provisionRetailer succeed
  assert.match(
    authAction,
    /await provisionWorker\(\{[\s\S]*?\}\)[\s\S]*?await sendWorkerWelcomeEmail\(/,
  );
  assert.match(
    authAction,
    /await provisionRetailer\(\{[\s\S]*?\}\)[\s\S]*?await sendRetailerWelcomeEmail\(/,
  );

  // Shifts action stops reminders when first shift is created
  assert.match(shiftsAction, /markRetailerFirstShiftPosted\(resolved\.storeId\)/);

  // Cron route enforces CRON_SECRET and calls runRetailerReminderJob
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /timingSafeEqual/);
  assert.match(cronRoute, /runRetailerReminderJob/);

  // Vercel Cron is configured for /api/cron/retailer-reminders
  const parsedVercel = JSON.parse(vercelConfig);
  assert.equal(parsedVercel.crons?.[0]?.path, "/api/cron/retailer-reminders");

  // Migration 0016 enforces RLS, idempotency unique index, and shift insert trigger
  assert.match(
    migrationSql,
    /create unique index if not exists email_workflow_deliveries_idempotency_key/i,
  );
  assert.match(
    migrationSql,
    /create trigger shifts_stop_retailer_reminders[\s\S]*?after insert on public\.shifts/i,
  );
  assert.match(migrationSql, /if new\.role is distinct from 'owner' then/i);
  assert.match(migrationSql, /and su_inner\.role = 'owner'/i);
  assert.match(serverCode, /RETAILER_REMINDERS_ENABLED\?\.trim\(\)\.toLowerCase\(\) !== "true"/);
  assert.doesNotMatch(serverCode, /select\("id,store_id,auth_user_id,email,role,created_at"\)/);
  assert.match(rolloutMigration, /v_rollout_timestamp \+ interval '14 days'/i);
  assert.match(rolloutMigration, /first_shift_posted_at is null\s+and stopped_at is null/i);
  assert.match(rolloutMigration, /on conflict \(marker\) do nothing/i);
  assert.match(rolloutMigration, /set next_reminder_due_at =/i);
  assert.doesNotMatch(rolloutMigration, /set\s+(registered_at|reminders_sent_count|last_reminder_sent_at)\s*=/i);
  assert.match(
    migrationSql,
    /alter table public\.email_workflow_deliveries enable row level security/i,
  );
  assert.match(
    migrationSql,
    /alter table public\.retailer_onboarding_reminders enable row level security/i,
  );
});
