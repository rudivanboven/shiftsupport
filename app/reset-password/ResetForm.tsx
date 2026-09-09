"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { Alert, FormGrid, PasswordInput, SubmitButton } from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";

export default function ResetPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(updatePassword, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

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

        <SubmitButton block pendingLabel="Saving…">
          Set new password <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
