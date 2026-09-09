import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import { Alert } from "@/components/ui/Form";
import ForgotPasswordForm from "./ForgotForm";

export const metadata: Metadata = { title: "Reset your password | ShiftSupport" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthLayout
      badge="Account help"
      asideTitle="Locked out? It happens."
      asideText="Enter the email you signed up with and we'll send you a secure link to choose a new password."
      points={[
        "The link works once and expires after an hour",
        "Your shifts and applications stay exactly as they are",
        "Works for both worker and retailer accounts",
      ]}
      eyebrow="Password reset"
      title="Forgot your password?"
      subtitle="We'll email you a link to set a new one."
      footer={
        <>
          Remembered it? <a href="/worker/login">Worker login</a>
          {" · "}
          <a href="/retailer/login">Retailer login</a>
        </>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        {params.error === "expired_link" ? (
          <Alert tone="error">
            That reset link has expired or was already used. Request a new one below.
          </Alert>
        ) : null}
        <ForgotPasswordForm />
      </div>
    </AuthLayout>
  );
}
