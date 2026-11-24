import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function resolveRedirectBase(request: NextRequest, origin: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return process.env.NODE_ENV === "development" || !forwardedHost
    ? origin
    : `https://${forwardedHost}`;
}

/**
 * Landing point for Supabase email links (confirm signup, password reset).
 * Exchanges the one-time code or token_hash for a session cookie, then forwards on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type") as EmailOtpType | null;
  const errorParam = searchParams.get("error") ?? searchParams.get("error_code");
  const nextParam = searchParams.get("next") ?? "/";
  // "//evil.com" starts with "/" but is a protocol-relative absolute URL,
  // so it has to be excluded explicitly.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\")
      ? nextParam
      : "/";
  const base = resolveRedirectBase(request, origin);
  const isRecoveryFlow = next === "/reset-password" || rawType === "recovery";

  if (errorParam) {
    if (isRecoveryFlow) {
      return NextResponse.redirect(`${base}/forgot-password?error=expired_link`);
    }
    return NextResponse.redirect(`${base}/worker/login?error=invalid_link`);
  }

  // If a recovery link arrives at /auth/callback with ?token_hash=...&type=recovery,
  // forward the token_hash straight to /reset-password without consuming it on GET,
  // so mail scanners that prefetch links cannot spend the one-time token.
  if (!code && tokenHash && rawType === "recovery") {
    const resetUrl = new URL("/reset-password", base);
    resetUrl.searchParams.set("token_hash", tokenHash);
    resetUrl.searchParams.set("type", "recovery");
    return NextResponse.redirect(resetUrl.toString());
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (isRecoveryFlow) {
        return NextResponse.redirect(`${base}/forgot-password?error=expired_link`);
      }
      return NextResponse.redirect(`${base}/worker/login?error=invalid_link`);
    }
    return NextResponse.redirect(`${base}${next}`);
  }

  if (tokenHash && rawType && ALLOWED_OTP_TYPES.has(rawType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: rawType,
      token_hash: tokenHash,
    });
    if (error) {
      if (isRecoveryFlow) {
        return NextResponse.redirect(`${base}/forgot-password?error=expired_link`);
      }
      return NextResponse.redirect(`${base}/worker/login?error=invalid_link`);
    }
    return NextResponse.redirect(`${base}${next}`);
  }

  // An expired or reused password-reset link arrives here with no code
  // (Supabase adds `error` / `error_code` instead): offer a new link rather
  // than a login page for one role.
  if (isRecoveryFlow) {
    return NextResponse.redirect(`${base}/forgot-password?error=expired_link`);
  }
  return NextResponse.redirect(`${base}/worker/login?error=invalid_link`);
}
