import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase email links (confirm signup, password reset).
 * Exchanges the one-time code for a session cookie, then forwards on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // "//evil.com" starts with "/" but is a protocol-relative absolute URL,
  // so it has to be excluded explicitly.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (!code) {
    // An expired or reused password-reset link arrives here with no code
    // (Supabase adds `error` / `error_code` instead): offer a new link rather
    // than a login page for one role. Signup confirmation links are unchanged.
    if (next === "/reset-password") {
      return NextResponse.redirect(`${origin}/forgot-password?error=expired_link`);
    }
    return NextResponse.redirect(`${origin}/worker/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/forgot-password?error=expired_link`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${next}`);
}
