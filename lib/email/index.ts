import "server-only";

/**
 * Transactional email boundary for the Operations Control Center.
 *
 * The application has no transactional email provider today (Supabase Auth
 * sends its own auth emails, which cannot be used for arbitrary messages).
 * Rather than inventing one, this module defines the contract and a registry
 * that is EMPTY until a provider is chosen. With nothing registered, sending
 * reports `not_configured` and the console offers a hand-off to the admin's
 * own mail client instead.
 *
 * To add a provider later:
 *   1. write an adapter implementing `EmailProvider` in lib/email/providers/,
 *      reading its API key from a server-only env var (never NEXT_PUBLIC_);
 *   2. register it in `PROVIDERS` below;
 *   3. set ADMIN_EMAIL_PROVIDER=<id> and ADMIN_EMAIL_FROM=<verified sender>.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailProvider {
  id: string;
  send(message: OutboundEmail & { from: string }): Promise<EmailSendResult>;
}

const PROVIDERS: Record<string, () => EmailProvider> = {
  // e.g. resend: () => createResendProvider(process.env.RESEND_API_KEY!),
};

export type EmailAvailability =
  | { configured: true; provider: EmailProvider; from: string }
  | { configured: false; reason: string };

export function getEmailProvider(): EmailAvailability {
  const id = process.env.ADMIN_EMAIL_PROVIDER?.trim();
  const from = process.env.ADMIN_EMAIL_FROM?.trim();

  if (!id) return { configured: false, reason: "No email provider is configured (ADMIN_EMAIL_PROVIDER)." };
  const factory = PROVIDERS[id];
  if (!factory) {
    console.error(`[email] ADMIN_EMAIL_PROVIDER "${id}" has no registered adapter.`);
    return { configured: false, reason: "The configured email provider has no adapter in this build." };
  }
  if (!from) return { configured: false, reason: "No sender address is configured (ADMIN_EMAIL_FROM)." };

  try {
    return { configured: true, provider: factory(), from };
  } catch (error) {
    console.error("[email] Provider could not be initialised:", error instanceof Error ? error.message : error);
    return { configured: false, reason: "The email provider could not be initialised." };
  }
}
