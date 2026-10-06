"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { Alert, FormGrid, PasswordInput, SubmitButton } from "@/components/ui/Form";
import { buttonClass } from "@/components/ui/buttonClass";
import type { FormState } from "@/lib/validation";

export default function ResetPasswordForm({ tokenHash }: { tokenHash?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(updatePassword, {});

  if (state.success) {
    return (
      <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
        <Alert tone="success">
          {state.success} You&apos;re signed in with your new password.
        </Alert>
        <a className={buttonClass("primary")} href={state.redirectTo ?? "/"}>
          Continue <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  }

  if (state.values?.linkExpired) {
    return (
      <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
        <Alert tone="error">{state.error}</Alert>
        <a className={buttonClass("primary")} href="/forgot-password">
          Request a new link <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  }

  // Once the link's token has been verified it cannot be used again; any
  // retry then runs on the session that verification created.
  const sendToken = tokenHash && !state.values?.tokenConsumed;

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        {sendToken ? <input type="hidden" name="tokenHash" value={tokenHash} /> : null}

        <PasswordInput
          label="New password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={state.fieldErrors?.password}
          showStrength
          required
        />

        <PasswordInput
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          error={state.fieldErrors?.confirmPassword}
          required
        />

        <SubmitButton block pendingLabel="Updating password…">
          Update password <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
