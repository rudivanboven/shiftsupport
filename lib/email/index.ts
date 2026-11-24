import "server-only";

import { createResendProvider } from "./providers/resend";

/**
 * Server-only transactional email boundary.
 *
 * Supabase Auth owns authentication messages; this adapter sends application
 * email independently and never handles Auth SMTP or reset links.
 */

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  contentType?: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
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

export function getEmailProvider(): EmailAvailability {
  const id = (
    process.env.EMAIL_PROVIDER ??
    process.env.ADMIN_EMAIL_PROVIDER ??
    (process.env.RESEND_API_KEY ? "resend" : "")
  ).trim().toLowerCase();
  const from = (
    process.env.EMAIL_FROM ?? process.env.ADMIN_EMAIL_FROM ?? ""
  ).trim();

  if (!id) return { configured: false, reason: "No email provider is configured (EMAIL_PROVIDER)." };
  const factory = PROVIDERS[id];
  if (!factory) {
    console.error(`[email] EMAIL_PROVIDER "${id}" has no registered adapter.`);
    return { configured: false, reason: "The configured email provider has no adapter in this build." };
  }
  if (!from) return { configured: false, reason: "No sender address is configured (EMAIL_FROM)." };

  try {
    return { configured: true, provider: factory(), from };
  } catch (error) {
    console.error("[email] Provider could not be initialised:", error instanceof Error ? error.message : error);
    return { configured: false, reason: "The email provider could not be initialised." };
  }
}
