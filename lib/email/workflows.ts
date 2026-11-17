import type { EmailAvailability } from "./index";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailTemplateSet {
  normaliseSiteUrl(siteUrl?: string | null): string;
  buildWorkerWelcomeEmail(options?: { siteUrl?: string | null }): RenderedEmail;
  buildRetailerWelcomeEmail(options?: { siteUrl?: string | null }): RenderedEmail;
  buildRetailerReminderEmail(options?: {
    firstName?: string | null;
    fullName?: string | null;
    siteUrl?: string | null;
  }): RenderedEmail;
}

const DEFAULT_SITE_URL = "http://localhost:3000";

function defaultNormaliseSiteUrl(siteUrl?: string | null): string {
  const raw = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).trim();
  if (!raw) return DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extracts a clean first name for email greetings.
 * Falls back to `"there"` ("Hi there,") when the name is missing, blank, or an email address.
 */
export function resolveGreetingFirstName(name?: string | null): string {
  if (!name || typeof name !== "string") return "there";
  const trimmed = name.trim();
  if (!trimmed) return "there";
  const firstToken = trimmed.split(/\s+/)[0]?.trim() ?? "";
  if (!firstToken || firstToken.includes("@")) return "there";
  return firstToken;
}

function renderBrandedLayout(options: {
  title: string;
  preheader: string;
  siteUrl: string;
  headingHtml: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  signatureHtml: string;
  footerNote: string;
}): string {
  const baseUrl = defaultNormaliseSiteUrl(options.siteUrl);
  const logoUrl = `${baseUrl}/images/logobalck.png`;
  const title = escapeHtml(options.title);
  const preheader = escapeHtml(options.preheader);

  const ctaBlock = options.cta
    ? `
              <!-- Call to Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ss-button" style="margin:28px 0;">
                <tr>
                  <td align="center" bgcolor="#2e7b3c" style="border-radius:999px;">
                    <a href="${escapeHtml(options.cta.href)}"
                       target="_blank"
                       style="display:inline-block; padding:14px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:bold; line-height:1.2; color:#ffffff; text-decoration:none; border-radius:999px;">
                      ${escapeHtml(options.cta.label)}
                    </a>
                  </td>
                </tr>
              </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .ss-card { padding: 32px 24px !important; }
      .ss-heading { font-size: 22px !important; }
      .ss-button { width: 100% !important; }
      .ss-button a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f0e8; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f0e8;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f0e8;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <a href="${escapeHtml(baseUrl)}" target="_blank" style="text-decoration:none; display:inline-block;">
                <img src="${escapeHtml(logoUrl)}" alt="ShiftSupport" width="168" style="display:block; width:168px; max-width:168px; height:auto; border:0; font-family:Arial, Helvetica, sans-serif; font-size:22px; font-weight:bold; color:#163024;" />
              </a>
            </td>
          </tr>
          <tr>
            <td class="ss-card" style="background-color:#ffffff; border:1px solid #e3ddd1; border-top:4px solid #2e7b3c; border-radius:16px; padding:40px 40px 36px;">
              <h1 class="ss-heading" style="margin:0 0 20px; font-family:Arial, Helvetica, sans-serif; font-size:24px; line-height:1.3; font-weight:bold; color:#163024;">
                ${options.headingHtml}
              </h1>
              ${options.bodyHtml}
              ${ctaBlock}
              <div style="margin:28px 0 0; padding-top:20px; border-top:1px solid #ece7dc; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                ${options.signatureHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#6e786f;">
              ShiftSupport &middot; Short shifts for local retailers<br>
              ${escapeHtml(options.footerNote)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const defaultTemplates: EmailTemplateSet = {
  normaliseSiteUrl: defaultNormaliseSiteUrl,
  buildWorkerWelcomeEmail(options = {}) {
    const siteUrl = defaultNormaliseSiteUrl(options.siteUrl);
    const dashboardUrl = `${siteUrl}/worker/dashboard`;
    const subject = "Welcome to ShiftSupport!";
    const text = [
      "Welcome to ShiftSupport! 🎉",
      "",
      "Your ShiftSupport account has been created successfully.",
      "",
      "There’s just one more step before you can start accepting shifts. You’ll receive a separate invitation from ADP to complete your employee onboarding, including the information needed to set you up for payroll.",
      "",
      "Please complete your ADP onboarding as soon as you receive the invitation.",
      "",
      "Once your onboarding is complete, you’ll be ready to start picking up available shifts!",
      "",
      `Worker dashboard: ${dashboardUrl}`,
      "",
      "Kind regards,",
      "",
      "Rudi van Boven",
      "Founder ShiftSupport",
    ].join("\n");
    const html = renderBrandedLayout({
      title: subject,
      preheader:
        "Your ShiftSupport account has been created successfully. Complete your ADP onboarding invitation to start accepting shifts.",
      siteUrl,
      headingHtml: "Welcome to ShiftSupport! 🎉",
      bodyHtml: `
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Your ShiftSupport account has been created successfully.
              </p>
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                There’s just one more step before you can start accepting shifts. You’ll receive a separate invitation from ADP to complete your employee onboarding, including the information needed to set you up for payroll.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background-color:#eef5ef; border-radius:12px; padding:14px 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#163024;">
                    Please complete your ADP onboarding as soon as you receive the invitation.
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Once your onboarding is complete, you’ll be ready to start picking up available shifts!
              </p>`,
      cta: { label: "Go to Worker Dashboard", href: dashboardUrl },
      signatureHtml: `
                <p style="margin:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                  Kind regards,
                </p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.5; color:#163024;">
                  <strong>Rudi van Boven</strong><br>
                  <span style="color:#6e786f;">Founder ShiftSupport</span>
                </p>`,
      footerNote: "You're receiving this because you created a Worker account on ShiftSupport.",
    });
    return { subject, text, html };
  },
  buildRetailerWelcomeEmail(options = {}) {
    const siteUrl = defaultNormaliseSiteUrl(options.siteUrl);
    const postShiftUrl = `${siteUrl}/retailer/shifts/new`;
    const subject = "Welcome to ShiftSupport!";
    const text = [
      "Welcome to ShiftSupport! 🎉",
      "",
      "Your retailer account is ready.",
      "",
      "Need an extra pair of hands? Post your first shift and let local workers know when and where you need support.",
      "",
      "Simply add the date, time, location, role, and shift details, and ShiftSupport will take it from there.",
      "",
      `Post your first shift: ${postShiftUrl}`,
      "",
      "Thank you and Kind regards,",
      "",
      "Rudi van Boven",
      "Founder ShiftSupport",
    ].join("\n");
    const html = renderBrandedLayout({
      title: subject,
      preheader:
        "Your retailer account is ready. Post your first shift and let local workers know when and where you need support.",
      siteUrl,
      headingHtml: "Welcome to ShiftSupport! 🎉",
      bodyHtml: `
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Your retailer account is ready.
              </p>
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Need an extra pair of hands? Post your first shift and let local workers know when and where you need support.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Simply add the date, time, location, role, and shift details, and ShiftSupport will take it from there.
              </p>`,
      cta: { label: "Post your first shift", href: postShiftUrl },
      signatureHtml: `
                <p style="margin:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                  Thank you and Kind regards,
                </p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.5; color:#163024;">
                  <strong>Rudi van Boven</strong><br>
                  <span style="color:#6e786f;">Founder ShiftSupport</span>
                </p>`,
      footerNote: "You're receiving this because you created a Retailer account on ShiftSupport.",
    });
    return { subject, text, html };
  },
  buildRetailerReminderEmail(options = {}) {
    const siteUrl = defaultNormaliseSiteUrl(options.siteUrl);
    const postShiftUrl = `${siteUrl}/retailer/shifts/new`;
    const subject = "Ready to post your first shift?";
    const greetingName = resolveGreetingFirstName(options.firstName ?? options.fullName);
    const text = [
      `Hi ${greetingName},`,
      "",
      "Just a quick reminder that your ShiftSupport account is ready whenever you need extra help.",
      "",
      "Whether it’s a call-out, busy period, weekend rush, or just a few extra hours of coverage, simply post a shift and let ShiftSupport help you fill the gap.",
      "",
      "Post your first shift today.",
      postShiftUrl,
      "",
      "Best,",
      "",
      "Rudi van Boven",
      "ShiftSupport",
    ].join("\n");
    const html = renderBrandedLayout({
      title: subject,
      preheader:
        "Just a quick reminder that your ShiftSupport account is ready whenever you need extra help.",
      siteUrl,
      headingHtml: "Ready to post your first shift?",
      bodyHtml: `
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Hi ${escapeHtml(greetingName)},
              </p>
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Just a quick reminder that your ShiftSupport account is ready whenever you need extra help.
              </p>
              <p style="margin:0 0 16px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                Whether it’s a call-out, busy period, weekend rush, or just a few extra hours of coverage, simply post a shift and let ShiftSupport help you fill the gap.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; font-weight:bold; color:#163024;">
                Post your first shift today.
              </p>`,
      cta: { label: "Post your first shift today", href: postShiftUrl },
      signatureHtml: `
                <p style="margin:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d4b42;">
                  Best,
                </p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.5; color:#163024;">
                  <strong>Rudi van Boven</strong><br>
                  <span style="color:#6e786f;">ShiftSupport</span>
                </p>`,
      footerNote:
        "You're receiving this reminder because your ShiftSupport retailer account is ready to post its first shift.",
    });
    return { subject, text, html };
  },
};
export const {
  normaliseSiteUrl,
  buildWorkerWelcomeEmail,
  buildRetailerWelcomeEmail,
  buildRetailerReminderEmail,
} = defaultTemplates;

export const RETAILER_REMINDER_INTERVAL_DAYS = 14;
export const RETAILER_REMINDER_INTERVAL_MS =
  RETAILER_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

/** How long a `pending` delivery claim locks out concurrent duplicate attempts. */
export const PENDING_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export type EmailWorkflowType =
  | "worker_welcome"
  | "retailer_welcome"
  | "retailer_shift_reminder";

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export interface DeliveryRecord {
  idempotencyKey: string;
  emailType: EmailWorkflowType;
  recipientRole: "worker" | "retailer";
  userId: string | null;
  workerId: string | null;
  storeId: string | null;
  recipientEmail: string;
  subject: string;
  reminderSequence: number | null;
  status: DeliveryStatus;
  attemptCount: number;
  provider: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
  lastAttemptAt: string;
}

export interface VerifiedWorkerAccount {
  isValidWorker: boolean;
  isRetailer: boolean;
  userId: string;
  workerId: string | null;
  email: string | null;
  fullName: string | null;
}

export interface VerifiedRetailerAccount {
  isValidRetailer: boolean;
  isWorker: boolean;
  userId: string;
  storeId: string | null;
  email: string | null;
  fullName: string | null;
  storeName: string | null;
  registeredAt: string | null;
}

export interface RetailerReminderCandidate {
  storeId: string;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  storeName: string | null;
  role: "retailer" | "worker" | "admin" | null;
  isWorker: boolean;
  registeredAt: string;
  remindersSentCount: number;
  lastReminderSentAt: string | null;
  nextReminderDueAt: string | null;
  firstShiftPostedAt: string | null;
  stoppedAt: string | null;
  stoppedReason: string | null;
  shiftsCount: number;
  firstShiftCreatedAt: string | null;
}

export interface ClaimDeliveryInput {
  idempotencyKey: string;
  emailType: EmailWorkflowType;
  recipientRole: "worker" | "retailer";
  userId: string | null;
  workerId: string | null;
  storeId: string | null;
  recipientEmail: string;
  subject: string;
  reminderSequence: number | null;
  now: Date;
}

export type ClaimDeliveryResult =
  | { claimed: true; attemptCount: number }
  | { claimed: false; reason: "already_sent" | "in_progress" };

export interface CompleteDeliveryInput {
  status: "sent" | "failed";
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  now: Date;
}

export interface EmailWorkflowRepository {
  verifyWorkerAccount(userId: string): Promise<VerifiedWorkerAccount>;
  verifyRetailerAccount(
    userId: string,
    storeId?: string | null,
  ): Promise<VerifiedRetailerAccount>;
  ensureRetailerReminderSchedule(input: {
    storeId: string;
    userId: string;
    registeredAt: Date;
  }): Promise<void>;
  claimDelivery(input: ClaimDeliveryInput): Promise<ClaimDeliveryResult>;
  completeDelivery(
    idempotencyKey: string,
    input: CompleteDeliveryInput,
  ): Promise<void>;
  hasStorePostedShift(storeId: string): Promise<{
    posted: boolean;
    firstShiftAt: string | null;
  }>;
  markFirstShiftPosted(
    storeId: string,
    postedAt: Date | string,
  ): Promise<void>;
  listRetailerReminderCandidates(): Promise<RetailerReminderCandidate[]>;
  recordReminderSent(input: {
    storeId: string;
    step: number;
    sentAt: string;
    nextReminderDueAt: string;
  }): Promise<void>;
  recordReminderFailed(input: {
    storeId: string;
    attemptedAt: string;
    error: string;
  }): Promise<void>;
}

export interface WorkflowDependencies {
  repo: EmailWorkflowRepository;
  getEmailProvider: () => EmailAvailability;
}

export function workerWelcomeIdempotencyKey(userId: string): string {
  return `worker_welcome:${userId}`;
}

export function retailerWelcomeIdempotencyKey(userId: string): string {
  return `retailer_welcome:${userId}`;
}

export function retailerReminderIdempotencyKey(
  storeId: string,
  step: number,
): string {
  return `retailer_shift_reminder:${storeId}:step:${step}`;
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendWorkflowEmailResult {
  ok: boolean;
  status: "sent" | "duplicate" | "skipped" | "failed";
  idempotencyKey?: string;
  providerMessageId?: string | null;
  reason?: string;
  error?: string;
}

/**
 * 1. Worker Welcome Email Workflow
 *
 * Triggered only after a Worker's Auth user and `workers` profile row have been
 * provisioned. Refuses Retailer accounts and guarantees at-most-once delivery
 * per Worker via `worker_welcome:<userId>`.
 */
export async function executeWorkerWelcomeEmail(
  input: {
    userId: string;
    email?: string | null;
    fullName?: string | null;
    siteUrl?: string | null;
    now?: Date;
  },
  deps: WorkflowDependencies,
): Promise<SendWorkflowEmailResult> {
  const now = input.now ?? new Date();
  const userId = input.userId?.trim();
  if (!userId) {
    return { ok: false, status: "skipped", reason: "missing_user_id" };
  }

  try {
    const account = await deps.repo.verifyWorkerAccount(userId);
    if (account.isRetailer || !account.isValidWorker) {
      return { ok: false, status: "skipped", reason: "not_worker" };
    }

    const recipientEmail = (input.email ?? account.email ?? "").trim().toLowerCase();
    if (!recipientEmail || !SIMPLE_EMAIL_RE.test(recipientEmail)) {
      return { ok: false, status: "skipped", reason: "invalid_email" };
    }

    const idempotencyKey = workerWelcomeIdempotencyKey(userId);
    const rendered = buildWorkerWelcomeEmail({
      siteUrl: normaliseSiteUrl(input.siteUrl),
    });

    const claim = await deps.repo.claimDelivery({
      idempotencyKey,
      emailType: "worker_welcome",
      recipientRole: "worker",
      userId,
      workerId: account.workerId,
      storeId: null,
      recipientEmail,
      subject: rendered.subject,
      reminderSequence: null,
      now,
    });

    if (!claim.claimed) {
      return {
        ok: true,
        status: "duplicate",
        idempotencyKey,
        reason: claim.reason,
      };
    }

    const availability = deps.getEmailProvider();
    if (!availability.configured) {
      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: null,
        providerMessageId: null,
        error: availability.reason,
        now,
      });
      return {
        ok: false,
        status: "failed",
        idempotencyKey,
        error: availability.reason,
      };
    }

    try {
      const result = await availability.provider.send({
        from: availability.from,
        to: recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { "Idempotency-Key": idempotencyKey },
      });

      await deps.repo.completeDelivery(idempotencyKey, {
        status: "sent",
        provider: availability.provider.id,
        providerMessageId: result.providerMessageId,
        error: null,
        now,
      });

      return {
        ok: true,
        status: "sent",
        idempotencyKey,
        providerMessageId: result.providerMessageId,
      };
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[email] Worker welcome email delivery failed:", errorMessage);
      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: availability.provider.id,
        providerMessageId: null,
        error: errorMessage,
        now,
      });
      return {
        ok: false,
        status: "failed",
        idempotencyKey,
        error: errorMessage,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error in executeWorkerWelcomeEmail:", errorMessage);
    return { ok: false, status: "failed", error: errorMessage };
  }
}

/**
 * 2. Retailer Welcome Email Workflow
 *
 * Triggered only after a Retailer's Auth user, `stores` row, and `store_users`
 * row have been provisioned. Refuses Worker accounts, registers the 14-day
 * onboarding reminder schedule, and guarantees at-most-once delivery per
 * Retailer via `retailer_welcome:<userId>`.
 */
export async function executeRetailerWelcomeEmail(
  input: {
    userId: string;
    storeId?: string | null;
    email?: string | null;
    fullName?: string | null;
    storeName?: string | null;
    siteUrl?: string | null;
    now?: Date;
  },
  deps: WorkflowDependencies,
): Promise<SendWorkflowEmailResult> {
  const now = input.now ?? new Date();
  const userId = input.userId?.trim();
  if (!userId) {
    return { ok: false, status: "skipped", reason: "missing_user_id" };
  }

  try {
    const account = await deps.repo.verifyRetailerAccount(userId, input.storeId);
    if (account.isWorker || !account.isValidRetailer || !account.storeId) {
      return { ok: false, status: "skipped", reason: "not_retailer" };
    }

    const registeredAt = account.registeredAt
      ? new Date(account.registeredAt)
      : now;

    await deps.repo.ensureRetailerReminderSchedule({
      storeId: account.storeId,
      userId,
      registeredAt,
    });

    const recipientEmail = (input.email ?? account.email ?? "").trim().toLowerCase();
    if (!recipientEmail || !SIMPLE_EMAIL_RE.test(recipientEmail)) {
      return { ok: false, status: "skipped", reason: "invalid_email" };
    }

    const idempotencyKey = retailerWelcomeIdempotencyKey(userId);
    const rendered = buildRetailerWelcomeEmail({
      siteUrl: normaliseSiteUrl(input.siteUrl),
    });

    const claim = await deps.repo.claimDelivery({
      idempotencyKey,
      emailType: "retailer_welcome",
      recipientRole: "retailer",
      userId,
      workerId: null,
      storeId: account.storeId,
      recipientEmail,
      subject: rendered.subject,
      reminderSequence: null,
      now,
    });

    if (!claim.claimed) {
      return {
        ok: true,
        status: "duplicate",
        idempotencyKey,
        reason: claim.reason,
      };
    }

    const availability = deps.getEmailProvider();
    if (!availability.configured) {
      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: null,
        providerMessageId: null,
        error: availability.reason,
        now,
      });
      return {
        ok: false,
        status: "failed",
        idempotencyKey,
        error: availability.reason,
      };
    }

    try {
      const result = await availability.provider.send({
        from: availability.from,
        to: recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { "Idempotency-Key": idempotencyKey },
      });

      await deps.repo.completeDelivery(idempotencyKey, {
        status: "sent",
        provider: availability.provider.id,
        providerMessageId: result.providerMessageId,
        error: null,
        now,
      });

      return {
        ok: true,
        status: "sent",
        idempotencyKey,
        providerMessageId: result.providerMessageId,
      };
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[email] Retailer welcome email delivery failed:", errorMessage);
      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: availability.provider.id,
        providerMessageId: null,
        error: errorMessage,
        now,
      });
      return {
        ok: false,
        status: "failed",
        idempotencyKey,
        error: errorMessage,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error in executeRetailerWelcomeEmail:", errorMessage);
    return { ok: false, status: "failed", error: errorMessage };
  }
}

export interface RetailerReminderJobSummary {
  ranAt: string;
  checked: number;
  sent: number;
  stopped: number;
  notDue: number;
  duplicatesPrevented: number;
  skippedInvalidOrNonRetailer: number;
  failed: number;
  errors: { storeId: string; error: string }[];
}

/** The persisted next_reminder_due_at is authoritative for every reminder. */
export function computeNextReminderDueMs(candidate: {
  nextReminderDueAt: string | null;
}): number {
  return candidate.nextReminderDueAt
    ? Date.parse(candidate.nextReminderDueAt)
    : Number.NaN;
}

/**
 * 3. Automated 14-Day Retailer Reminder Scheduler
 *
 * Evaluates all Retailer stores, stops reminders for any store that has posted
 * its first shift, and sends a follow-up reminder every 14 days while no shift
 * has been posted.
 */
export async function executeRetailerReminderJob(
  options: {
    now?: Date;
    siteUrl?: string | null;
  } = {},
  deps: WorkflowDependencies,
): Promise<RetailerReminderJobSummary> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const siteUrl = normaliseSiteUrl(options.siteUrl);

  const summary: RetailerReminderJobSummary = {
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

  const candidates = await deps.repo.listRetailerReminderCandidates();

  for (const candidate of candidates) {
    summary.checked += 1;

    // 1. Never send retailer reminders to Workers or non-retailer accounts.
    if (candidate.isWorker || candidate.role !== "retailer") {
      summary.skippedInvalidOrNonRetailer += 1;
      continue;
    }

    // 2. If the retailer has already posted a shift (or reminders were already stopped),
    //    ensure the schedule is marked stopped and skip sending.
    if (
      candidate.stoppedAt ||
      candidate.firstShiftPostedAt ||
      candidate.shiftsCount > 0
    ) {
      if (!candidate.stoppedAt || !candidate.firstShiftPostedAt) {
        await deps.repo.markFirstShiftPosted(
          candidate.storeId,
          candidate.firstShiftCreatedAt ?? now,
        );
      }
      summary.stopped += 1;
      continue;
    }

    // 3. Validate recipient email.
    const recipientEmail = (candidate.email ?? "").trim().toLowerCase();
    if (!recipientEmail || !SIMPLE_EMAIL_RE.test(recipientEmail)) {
      summary.skippedInvalidOrNonRetailer += 1;
      continue;
    }

    // 4. Check 14-day interval eligibility.
    const dueMs = computeNextReminderDueMs({
      nextReminderDueAt: candidate.nextReminderDueAt,
    });
    if (!Number.isFinite(dueMs) || nowMs < dueMs) {
      summary.notDue += 1;
      continue;
    }

    // 5. Re-check live shift state right before claiming/sending so a shift posted
    //    moments ago immediately stops the reminder.
    const liveShiftState = await deps.repo.hasStorePostedShift(candidate.storeId);
    if (liveShiftState.posted) {
      await deps.repo.markFirstShiftPosted(
        candidate.storeId,
        liveShiftState.firstShiftAt ?? now,
      );
      summary.stopped += 1;
      continue;
    }

    const nextStep = candidate.remindersSentCount + 1;
    const idempotencyKey = retailerReminderIdempotencyKey(
      candidate.storeId,
      nextStep,
    );

    const rendered = buildRetailerReminderEmail({
      fullName: candidate.fullName,
      siteUrl,
    });

    // 6. Claim the reminder step idempotently so concurrent or repeated cron runs
    //    never send duplicate emails.
    const claim = await deps.repo.claimDelivery({
      idempotencyKey,
      emailType: "retailer_shift_reminder",
      recipientRole: "retailer",
      userId: candidate.userId,
      workerId: null,
      storeId: candidate.storeId,
      recipientEmail,
      subject: rendered.subject,
      reminderSequence: nextStep,
      now,
    });

    if (!claim.claimed) {
      summary.duplicatesPrevented += 1;
      continue;
    }

    // 7. Send through the configured server-side email provider.
    const availability = deps.getEmailProvider();
    if (!availability.configured) {
      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: null,
        providerMessageId: null,
        error: availability.reason,
        now,
      });
      await deps.repo.recordReminderFailed({
        storeId: candidate.storeId,
        attemptedAt: now.toISOString(),
        error: availability.reason,
      });
      summary.failed += 1;
      summary.errors.push({
        storeId: candidate.storeId,
        error: availability.reason,
      });
      continue;
    }

    try {
      const sendResult = await availability.provider.send({
        from: availability.from,
        to: recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { "Idempotency-Key": idempotencyKey },
      });

      const nextDueIso = new Date(
        nowMs + RETAILER_REMINDER_INTERVAL_MS,
      ).toISOString();

      await deps.repo.completeDelivery(idempotencyKey, {
        status: "sent",
        provider: availability.provider.id,
        providerMessageId: sendResult.providerMessageId,
        error: null,
        now,
      });

      await deps.repo.recordReminderSent({
        storeId: candidate.storeId,
        step: nextStep,
        sentAt: now.toISOString(),
        nextReminderDueAt: nextDueIso,
      });

      summary.sent += 1;
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(
        `[email] Retailer reminder failed for store ${candidate.storeId}:`,
        errorMessage,
      );

      await deps.repo.completeDelivery(idempotencyKey, {
        status: "failed",
        provider: availability.provider.id,
        providerMessageId: null,
        error: errorMessage,
        now,
      });

      await deps.repo.recordReminderFailed({
        storeId: candidate.storeId,
        attemptedAt: now.toISOString(),
        error: errorMessage,
      });

      summary.failed += 1;
      summary.errors.push({
        storeId: candidate.storeId,
        error: errorMessage,
      });
    }
  }

  return summary;
}

/* ------------------------------------------------------------------ *
 * In-memory repository implementation (used for deterministic tests)
 * ------------------------------------------------------------------ */

export interface InMemoryUserSeed {
  userId: string;
  role: "worker" | "retailer" | "admin";
  email: string | null;
  fullName: string | null;
  workerId?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  registeredAt?: string;
  remindersSentCount?: number;
  lastReminderSentAt?: string | null;
  nextReminderDueAt?: string;
  firstShiftPostedAt?: string | null;
  stoppedAt?: string | null;
}

export function createInMemoryWorkflowRepository(
  initialUsers: InMemoryUserSeed[] = [],
) {
  const users = new Map<string, InMemoryUserSeed>();
  const stores = new Map<
    string,
    {
      storeId: string;
      userId: string;
      storeName: string | null;
      registeredAt: string;
    }
  >();
  const schedules = new Map<
    string,
    {
      storeId: string;
      userId: string | null;
      registeredAt: string;
      remindersSentCount: number;
      lastReminderSentAt: string | null;
      nextReminderDueAt: string;
      firstShiftPostedAt: string | null;
      stoppedAt: string | null;
      stoppedReason: string | null;
      lastError: string | null;
      lastAttemptAt: string | null;
    }
  >();
  const shiftsByStore = new Map<string, { id: string; createdAt: string }[]>();
  const deliveries = new Map<string, DeliveryRecord>();

  function addSeed(seed: InMemoryUserSeed) {
    const registeredAt = seed.registeredAt ?? new Date().toISOString();
    users.set(seed.userId, { ...seed, registeredAt });
    if (seed.storeId) {
      stores.set(seed.storeId, {
        storeId: seed.storeId,
        userId: seed.userId,
        storeName: seed.storeName ?? "Test Store",
        registeredAt,
      });
      if (!schedules.has(seed.storeId) && seed.role === "retailer" && !seed.workerId) {
        const regMs = Date.parse(registeredAt);
        schedules.set(seed.storeId, {
          storeId: seed.storeId,
          userId: seed.userId,
          registeredAt,
          remindersSentCount: seed.remindersSentCount ?? 0,
          lastReminderSentAt: seed.lastReminderSentAt ?? null,
          nextReminderDueAt:
            seed.nextReminderDueAt ??
            new Date(regMs + RETAILER_REMINDER_INTERVAL_MS).toISOString(),
          firstShiftPostedAt: seed.firstShiftPostedAt ?? null,
          stoppedAt: seed.stoppedAt ?? null,
          stoppedReason: null,
          lastError: null,
          lastAttemptAt: null,
        });
      }
    }
  }

  for (const seed of initialUsers) {
    addSeed(seed);
  }

  const repo: EmailWorkflowRepository = {
    async verifyWorkerAccount(userId) {
      const u = users.get(userId);
      if (!u) {
        return {
          isValidWorker: false,
          isRetailer: false,
          userId,
          workerId: null,
          email: null,
          fullName: null,
        };
      }
      const isRetailer = u.role === "retailer" || Boolean(u.storeId);
      const isValidWorker =
        u.role === "worker" && Boolean(u.workerId) && !isRetailer;
      return {
        isValidWorker,
        isRetailer,
        userId,
        workerId: u.workerId ?? null,
        email: u.email,
        fullName: u.fullName,
      };
    },

    async verifyRetailerAccount(userId, storeId) {
      const u = users.get(userId);
      if (!u) {
        return {
          isValidRetailer: false,
          isWorker: false,
          userId,
          storeId: null,
          email: null,
          fullName: null,
          storeName: null,
          registeredAt: null,
        };
      }
      const isWorker = u.role === "worker" || Boolean(u.workerId);
      const resolvedStoreId = storeId ?? u.storeId ?? null;
      const isValidRetailer =
        u.role === "retailer" && Boolean(resolvedStoreId) && !isWorker;
      return {
        isValidRetailer,
        isWorker,
        userId,
        storeId: resolvedStoreId,
        email: u.email,
        fullName: u.fullName,
        storeName: u.storeName ?? null,
        registeredAt: u.registeredAt ?? null,
      };
    },

    async ensureRetailerReminderSchedule({ storeId, userId, registeredAt }) {
      if (schedules.has(storeId)) return;
      const regIso = registeredAt.toISOString();
      schedules.set(storeId, {
        storeId,
        userId,
        registeredAt: regIso,
        remindersSentCount: 0,
        lastReminderSentAt: null,
        nextReminderDueAt: new Date(
          registeredAt.getTime() + RETAILER_REMINDER_INTERVAL_MS,
        ).toISOString(),
        firstShiftPostedAt: null,
        stoppedAt: null,
        stoppedReason: null,
        lastError: null,
        lastAttemptAt: null,
      });
    },

    async claimDelivery(input) {
      const existing = deliveries.get(input.idempotencyKey);
      if (existing) {
        if (existing.status === "sent") {
          return { claimed: false, reason: "already_sent" };
        }
        if (existing.status === "pending") {
          const ageMs =
            input.now.getTime() - Date.parse(existing.lastAttemptAt);
          if (ageMs < PENDING_CLAIM_TIMEOUT_MS) {
            return { claimed: false, reason: "in_progress" };
          }
        }
        const nextAttempt = existing.attemptCount + 1;
        deliveries.set(input.idempotencyKey, {
          ...existing,
          status: "pending",
          attemptCount: nextAttempt,
          lastAttemptAt: input.now.toISOString(),
        });
        return { claimed: true, attemptCount: nextAttempt };
      }

      deliveries.set(input.idempotencyKey, {
        idempotencyKey: input.idempotencyKey,
        emailType: input.emailType,
        recipientRole: input.recipientRole,
        userId: input.userId,
        workerId: input.workerId,
        storeId: input.storeId,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        reminderSequence: input.reminderSequence,
        status: "pending",
        attemptCount: 1,
        provider: null,
        providerMessageId: null,
        lastError: null,
        sentAt: null,
        lastAttemptAt: input.now.toISOString(),
      });
      return { claimed: true, attemptCount: 1 };
    },

    async completeDelivery(idempotencyKey, input) {
      const existing = deliveries.get(idempotencyKey);
      if (!existing) return;
      deliveries.set(idempotencyKey, {
        ...existing,
        status: input.status,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        lastError: input.error,
        sentAt: input.status === "sent" ? input.now.toISOString() : existing.sentAt,
        lastAttemptAt: input.now.toISOString(),
      });
    },

    async hasStorePostedShift(storeId) {
      const list = shiftsByStore.get(storeId) ?? [];
      if (list.length === 0) return { posted: false, firstShiftAt: null };
      return { posted: true, firstShiftAt: list[0].createdAt };
    },

    async markFirstShiftPosted(storeId, postedAt) {
      const iso =
        typeof postedAt === "string" ? postedAt : postedAt.toISOString();
      const existing = schedules.get(storeId);
      if (existing) {
        existing.firstShiftPostedAt = existing.firstShiftPostedAt ?? iso;
        existing.stoppedAt = existing.stoppedAt ?? iso;
        existing.stoppedReason = existing.stoppedReason ?? "first_shift_posted";
      }
    },

    async listRetailerReminderCandidates() {
      const results: RetailerReminderCandidate[] = [];
      for (const [storeId, store] of stores.entries()) {
        const u = users.get(store.userId);
        const sched = schedules.get(storeId);
        const shifts = shiftsByStore.get(storeId) ?? [];
        results.push({
          storeId,
          userId: store.userId,
          email: u?.email ?? null,
          fullName: u?.fullName ?? null,
          storeName: store.storeName,
          role: u?.role ?? null,
          isWorker: u?.role === "worker" || Boolean(u?.workerId),
          registeredAt: sched?.registeredAt ?? store.registeredAt,
          remindersSentCount: sched?.remindersSentCount ?? 0,
          lastReminderSentAt: sched?.lastReminderSentAt ?? null,
          nextReminderDueAt: sched?.nextReminderDueAt ?? null,
          firstShiftPostedAt: sched?.firstShiftPostedAt ?? null,
          stoppedAt: sched?.stoppedAt ?? null,
          stoppedReason: sched?.stoppedReason ?? null,
          shiftsCount: shifts.length,
          firstShiftCreatedAt: shifts[0]?.createdAt ?? null,
        });
      }
      return results;
    },

    async recordReminderSent({ storeId, step, sentAt, nextReminderDueAt }) {
      const existing = schedules.get(storeId);
      if (existing) {
        existing.remindersSentCount = step;
        existing.lastReminderSentAt = sentAt;
        existing.nextReminderDueAt = nextReminderDueAt;
        existing.lastError = null;
        existing.lastAttemptAt = sentAt;
      }
    },

    async recordReminderFailed({ storeId, attemptedAt, error }) {
      const existing = schedules.get(storeId);
      if (existing) {
        existing.lastError = error;
        existing.lastAttemptAt = attemptedAt;
      }
    },
  };

  return {
    repo,
    addUser: addSeed,
    postShift(storeId: string, createdAt = new Date().toISOString()) {
      const list = shiftsByStore.get(storeId) ?? [];
      list.push({ id: `shift_${list.length + 1}`, createdAt });
      shiftsByStore.set(storeId, list);
      const sched = schedules.get(storeId);
      if (sched && !sched.firstShiftPostedAt) {
        sched.firstShiftPostedAt = createdAt;
        sched.stoppedAt = createdAt;
        sched.stoppedReason = "first_shift_posted";
      }
    },
    getDeliveries: () => [...deliveries.values()],
    getSchedule: (storeId: string) => schedules.get(storeId) ?? null,
  };
}
