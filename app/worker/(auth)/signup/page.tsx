import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import WorkerSignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Create a worker account | ShiftSupport",
};

export default function WorkerSignupPage() {
  return (
    <AuthLayout
      badge="For workers"
      asideTitle="Real shifts. Real pay. On your schedule."
      asideText="Sign up once, then browse short retail shifts posted by local stores. Apply to the ones that suit you and get an answer fast."
      points={[
        "Free to join — no fees, ever",
        "Apply to a shift in a single tap",
        "Store contact details as soon as you're hired",
      ]}
      eyebrow="Worker sign up"
      title="Create your account"
      subtitle="It takes about a minute. You'll be browsing open shifts straight after."
      footer={
        <>
          Already have an account? <a href="/worker/login">Log in</a>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Looking to hire instead? <a href="/retailer/signup">Sign up as a retailer</a>
          </div>
        </>
      }
    >
      <WorkerSignupForm />
    </AuthLayout>
  );
}
