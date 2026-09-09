import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import {
  Alert,
} from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import { getUser } from "@/lib/auth/session";
import ResetPasswordForm from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password | ShiftSupport" };

export default async function ResetPasswordPage() {
  const user = await getUser();

  return (
    <AuthLayout
      badge="Account help"
      asideTitle="Choose something new."
      asideText="Pick a password you don't use anywhere else. Once it's saved you'll go straight to your dashboard."
      points={[
        "At least 8 characters",
        "Mix letters, numbers and symbols for a stronger password",
        "You stay signed in on this device",
      ]}
      eyebrow="Password reset"
      title={user ? "Set a new password" : "Link expired"}
      subtitle={
        user
          ? "Enter a new password for your ShiftSupport account."
          : "This reset link is no longer valid."
      }
      footer={
        <>
          Need help? <a href="/contact">Contact us</a>
        </>
      }
    >
      {user ? (
        <ResetPasswordForm />
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
