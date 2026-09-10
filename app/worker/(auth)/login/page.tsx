import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import { Alert } from "@/components/ui/Form";
import { redirectIfSignedIn } from "@/lib/auth/session";
import WorkerLoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Worker login | ShiftSupport",
};

const NOTICES: Record<string, { tone: "success" | "error"; message: string }> = {
  missing_profile: {
    tone: "error",
    message: "We couldn't find a profile for that login. Please sign up first.",
  },
  missing_worker: {
    tone: "error",
    message: "Your worker record is incomplete. Please contact support.",
  },
  invalid_link: { tone: "error", message: "That link is invalid or has expired." },
};

export default async function WorkerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; confirm?: string; error?: string }>;
}) {
  const params = await searchParams;
  const notice = params.error ? NOTICES[params.error] : undefined;

  // Already signed in? Go straight to whichever dashboard their role owns.
  // Skipped while an account problem is on screen, which would otherwise
  // bounce between this page and the dashboard forever.
  await redirectIfSignedIn({ skip: Boolean(params.error) });

  return (
    <AuthLayout
      badge="For workers"
      asideTitle="Pick up shifts that fit around your life."
      asideText="Local retailers near you post short shifts every week. Browse what's open, apply in one tap, and get paid for the hours you actually want to work."
      points={[
        "Short shifts, no long-term commitment",
        "See the pay rate before you apply",
        "Get hired and start the same week",
      ]}
      eyebrow="Worker login"
      title="Welcome back"
      subtitle="Log in to see the shifts open near you and track your applications."
      footer={
        <>
          New to ShiftSupport? <a href="/worker/signup">Create a worker account</a>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Are you a retailer? <a href="/retailer/login">Retailer login</a>
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
        <WorkerLoginForm next={params.next} />
      </div>
    </AuthLayout>
  );
}
