import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import { redirectIfSignedIn } from "@/lib/auth/session";
import WorkerSignupForm from "./SignupForm";
import { isWorkerSignupFreeMode } from "@/lib/signup-checkout";

export const metadata: Metadata = {
  title: "Create a worker account | ShiftSupport",
};

export default async function WorkerSignupPage() {
  // A signed-in user never needs the signup form.
  await redirectIfSignedIn();

  return (
    <AuthLayout
      badge="For workers"
      asideTitle="Real shifts. Real pay. On your schedule."
      asideText="Sign up once, then browse short retail shifts posted by local stores. Apply to the ones that suit you and get an answer fast."
      points={[
        isWorkerSignupFreeMode()
          ? "Free access to eligible shifts — no membership payment required"
          : "Worker membership checkout is required to access shifts",
        "Apply to a shift in a single tap",
        "Store contact details as soon as you're hired",
      ]}
      eyebrow="Worker sign up"
      title="Create your account"
      subtitle={isWorkerSignupFreeMode()
        ? "It takes about a minute. You can browse and apply for eligible shifts without a membership payment."
        : "It takes about a minute. Worker membership access is managed through Pricing & Payments."}
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
