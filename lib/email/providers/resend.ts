import type { EmailProvider, EmailSendResult, OutboundEmail } from "../index";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export interface ResendProviderOptions {
  apiKey?: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Resend API adapter. The API key is read server-side and never returned. */
export function createResendProvider(
  options: ResendProviderOptions = {},
): EmailProvider {
  const apiKey = (options.apiKey ?? process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const apiUrl = (options.apiUrl ?? process.env.RESEND_API_URL ?? RESEND_EMAILS_URL).trim();
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "resend",
    async send(message: OutboundEmail & { from: string }): Promise<EmailSendResult> {
      const attachments =
        message.attachments && message.attachments.length > 0
          ? message.attachments.map((att) => ({
              filename: att.filename,
              content: att.content,
              ...(att.contentType ? { content_type: att.contentType } : {}),
            }))
          : undefined;

      const response = await fetchImpl(apiUrl, {
        method: "POST",
        headers: {
          ...message.headers,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          ...(attachments ? { attachments } : {}),
        }),
      });

      let payload: { id?: string; message?: string } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        // Keep the status code if an upstream proxy returns a non-JSON body.
      }

      if (!response.ok) {
        throw new Error(
          `Resend API error (${response.status}): ${payload.message ?? "request failed"}`,
        );
      }

      return {
        providerMessageId: typeof payload.id === "string" ? payload.id : null,
      };
    },
  };
}
