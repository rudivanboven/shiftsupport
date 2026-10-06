import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import {
  Alert,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import { getUser } from "@/lib/auth/session";
import ResetPasswordForm from "./ResetForm";

export const metadata: Metadata = {
  title: "Set a new password | ShiftSupport",
  // The reset token is in this page's URL; never pass it on in a Referer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * The page the password-reset email opens.
 *
 * The branded email links here with `?token_hash=…&type=recovery`. The token
 * is NOT verified on load — only when the new password is submitted — so link
 * scanners that open the URL ahead of the user cannot spend it. Older links go
 * through /auth/callback first and arrive here with a session instead.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; error_code?: string }>;
}) {
  const params = await searchParams;
  const tokenHash =
    params.type === "recovery" && params.token_hash && !params.error_code
      ? params.token_hash
      : undefined;
  const user = tokenHash ? null : await getUser();
  const canReset = Boolean(tokenHash || user);

  return (
    <AuthLayout
      badge="Account help"
      asideTitle="Choose something new."
      asideText="Pick a password you don't use anywhere else. Once it's saved you're signed straight in."
      points={[
        "At least 8 characters",
        "Mix letters, numbers and symbols for a stronger password",
        "Other devices signed in to your account are signed out",
      ]}
      eyebrow="Password reset"
      title={canReset ? "Set a new password" : "Link expired"}
      subtitle={
        canReset
          ? "Enter a new password for your ShiftSupport account."
          : "This reset link is no longer valid."
      }
      footer={
        <>
          Need help? <a href="/contact">Contact us</a>
        </>
      }
    >
      {canReset ? (
        <ResetPasswordForm tokenHash={tokenHash} />
      ) : (
        <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
          <Alert tone="error">
            Password reset links can only be used once and expire after an hour.
          </Alert>
          <a className={buttonClass("primary")} href="/forgot-password">
            Request a new link <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
    </AuthLayout>
  );
}
