import type { EmailProvider, EmailSendResult, OutboundEmail } from "../index";

const DEFAULT_RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendProviderOptions {
  apiKey?: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Resend transactional email adapter (`https://api.resend.com/emails`).
 *
 * Uses the native Node.js `fetch` API so no extra runtime dependency is needed,
 * supports both HTML and plain-text bodies, and forwards an `Idempotency-Key`
 * header when provided by the caller.
 */
export function createResendProvider(options: ResendProviderOptions = {}): EmailProvider {
  const apiKey = (options.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const apiUrl = (options.apiUrl ?? process.env.RESEND_API_URL ?? DEFAULT_RESEND_API_URL).trim();
  const fetchFn = options.fetchImpl ?? fetch;

  return {
    id: "resend",
    async send(message: OutboundEmail & { from: string }): Promise<EmailSendResult> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      if (message.headers) {
        for (const [key, value] of Object.entries(message.headers)) {
          if (value) headers[key] = value;
        }
      }

      const payload: Record<string, unknown> = {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      };

      if (message.html) {
        payload.html = message.html;
      }
      if (message.replyTo) {
        payload.reply_to = message.replyTo;
      }

      const response = await fetchFn(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      let body: { id?: string; message?: string; name?: string } | null = null;
      try {
        body = (await response.json()) as { id?: string; message?: string; name?: string };
      } catch {
        // Non-JSON error body from upstream proxy/gateway.
      }

      if (!response.ok) {
        const detail = body?.message ?? `HTTP ${response.status}`;
        throw new Error(`Resend API error (${response.status}): ${detail}`);
      }

      return {
        providerMessageId: typeof body?.id === "string" ? body.id : null,
      };
    },
  };
}
