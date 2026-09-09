import type { Metadata } from "next";
import AuthLayout from "@/components/auth/AuthLayout";
import RetailerSignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Create a retailer account | ShiftSupport",
};

export default function RetailerSignupPage() {
  return (
    <AuthLayout
      badge="For retailers"
      asideTitle="Staff your busiest hours, not your whole week."
      asideText="Set up your store once. From then on, posting a shift takes a minute and you choose exactly who works it."
      points={[
        "No agency fees and no long contracts",
        "Every applicant in one clear list",
        "Your contact details stay private until you hire",
      ]}
      eyebrow="Retailer sign up"
      title="Set up your store"
      subtitle="Tell us about you and your store, and you can post your first shift right away."
      footer={
        <>
          Already have an account? <a href="/retailer/login">Log in</a>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Looking for shifts instead? <a href="/worker/signup">Sign up as a worker</a>
          </div>
        </>
      }
    >
      <RetailerSignupForm />
    </AuthLayout>
  );
}
