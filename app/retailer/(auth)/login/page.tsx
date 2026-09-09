import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import { Alert } from "@/components/ui/Form";
import RetailerLoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Retailer login | ShiftSupport",
};

const NOTICES: Record<string, { tone: "success" | "error"; message: string }> = {
  missing_profile: {
    tone: "error",
    message: "We couldn't find a profile for that login. Please sign up first.",
  },
  missing_store: {
    tone: "error",
    message: "Your store record is incomplete. Please contact support.",
  },
  invalid_link: { tone: "error", message: "That link is invalid or has expired." },
};

export default async function RetailerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; confirm?: string; error?: string }>;
}) {
  const params = await searchParams;
  const notice = params.error ? NOTICES[params.error] : undefined;

  return (
    <AuthLayout
      badge="For retailers"
      asideTitle="Cover the busy hours without a new hire."
      asideText="Post a short shift in under a minute, review who applies, and hire the person you want. No agency fees, no long contracts."
      points={[
        "Post a shift in under a minute",
        "See every applicant in one place",
        "Hire with a single click",
      ]}
      eyebrow="Retailer login"
      title="Welcome back"
      subtitle="Log in to manage your shifts, review applicants and keep your store covered."
      footer={
        <>
          New to ShiftSupport? <a href="/retailer/signup">Create a retailer account</a>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Looking for shifts? <a href="/worker/login">Worker login</a>
          </div>
        </>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        {params.confirm ? (
          <Alert tone="success">
            Almost there — check your inbox and confirm your email address, then log in.
          </Alert>
        ) : null}
        {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}
        <RetailerLoginForm next={params.next} />
      </div>
    </AuthLayout>
  );
}
