"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Alert, FormGrid, Input, SubmitButton } from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";

export default function ForgotPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.success) {
    return (
      <FormGrid>
        <Alert tone="success">{state.success}</Alert>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.65 }}>
          The link is valid for one hour. If it doesn&apos;t arrive within a few
          minutes, check your spam folder.
        </p>
      </FormGrid>
    );
  }

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          required
        />

        <SubmitButton block pendingLabel="Sending link…">
          Send reset link <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
