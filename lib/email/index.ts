import "server-only";

import { createResendProvider } from "./providers/resend";

/**
 * Transactional email boundary for ShiftSupport (automated welcome/reminder
 * workflows and the Operations Control Center).
 *
 * Supabase Auth sends its own authentication emails (confirmation, password
 * reset), which cannot be used for application-level transactional emails.
 * Application emails are sent server-side through the registered provider
 * below (Resend by default when configured).
 *
 * Configuration (server-side environment variables only — never NEXT_PUBLIC_):
 *   - EMAIL_PROVIDER or ADMIN_EMAIL_PROVIDER: "resend" (defaults to "resend" when RESEND_API_KEY is set)
 *   - EMAIL_FROM or ADMIN_EMAIL_FROM or RESEND_FROM_EMAIL: verified sender address (e.g. "ShiftSupport <noreply@shiftsupport.com>")
 *   - RESEND_API_KEY: Resend server API key
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailProvider {
  id: string;
  send(message: OutboundEmail & { from: string }): Promise<EmailSendResult>;
}

const PROVIDERS: Record<string, () => EmailProvider> = {
  resend: () => createResendProvider(),
};

export type EmailAvailability =
  | { configured: true; provider: EmailProvider; from: string }
  | { configured: false; reason: string };

let testProviderOverride: EmailAvailability | null = null;

/**
 * Allows automated tests to inject a mock or spy provider without network calls.
 */
export function setEmailProviderForTests(override: EmailAvailability | null) {
  testProviderOverride = override;
}

export function getEmailProvider(): EmailAvailability {
  if (testProviderOverride) return testProviderOverride;

  const explicitId = (
    process.env.EMAIL_PROVIDER ??
    process.env.ADMIN_EMAIL_PROVIDER ??
    ""
  )
    .trim()
    .toLowerCase();

  const id =
    explicitId || (process.env.RESEND_API_KEY?.trim() ? "resend" : "");

  const from = (
    process.env.EMAIL_FROM ??
    process.env.ADMIN_EMAIL_FROM ??
    process.env.RESEND_FROM_EMAIL ??
    ""
  ).trim();

  if (!id) {
    return {
      configured: false,
      reason:
        "No email provider is configured (set EMAIL_PROVIDER=resend / ADMIN_EMAIL_PROVIDER=resend and RESEND_API_KEY).",
    };
  }

  const factory = PROVIDERS[id];
  if (!factory) {
    console.error(`[email] Email provider "${id}" has no registered adapter.`);
    return {
      configured: false,
      reason: "The configured email provider has no adapter in this build.",
    };
  }

  if (!from) {
    return {
      configured: false,
      reason:
        "No sender address is configured (set EMAIL_FROM or ADMIN_EMAIL_FROM).",
    };
  }

  try {
    return { configured: true, provider: factory(), from };
  } catch (error) {
    console.error(
      "[email] Provider could not be initialised:",
      error instanceof Error ? error.message : error,
    );
    return {
      configured: false,
      reason:
        error instanceof Error
          ? `The email provider could not be initialised (${error.message})`
          : "The email provider could not be initialised.",
    };
  }
}
