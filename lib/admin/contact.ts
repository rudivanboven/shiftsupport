import { DEFAULT_PHONE_COUNTRY_CODE } from "./config";

export interface ContactLinks {
  phoneDisplay: string | null;
  telHref: string | null;
  whatsappHref: string | null;
  email: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * International digits for a saved phone number, or null when the number is
 * too ambiguous to dial across borders (WhatsApp needs a country code).
 */
export function internationalDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === 10) {
    digits = `${DEFAULT_PHONE_COUNTRY_CODE}${digits}`;
  } else if (!(digits.length === 11 && digits.startsWith(DEFAULT_PHONE_COUNTRY_CODE))) {
    return null;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** tel:, WhatsApp and email targets for one person, built server-side. */
export function contactLinks(phone: string | null | undefined, email: string | null | undefined): ContactLinks {
  const international = internationalDigits(phone);
  const localDigits = phone?.replace(/[^\d+]/g, "") ?? "";
  const cleanEmail = email?.trim() && EMAIL_RE.test(email.trim()) ? email.trim() : null;

  return {
    phoneDisplay: phone?.trim() || null,
    telHref: international ? `tel:+${international}` : localDigits.replace(/\+/g, "").length >= 7 ? `tel:${localDigits}` : null,
    whatsappHref: international ? `https://wa.me/${international}` : null,
    email: cleanEmail,
  };
}
