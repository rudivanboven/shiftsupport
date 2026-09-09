"use client";

import { useActionState } from "react";
import { changePassword, updateEmail } from "@/app/actions/profile";
import {
  Alert,
  FormActions,
  FormGrid,
  Input,
  PasswordInput,
  SubmitButton,
} from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function PersonalDetailsForm({
  action,
  fullName,
  phone,
}: {
  action: Action;
  fullName: string;
  phone: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName}
          error={state.fieldErrors?.fullName}
          required
        />

        <Input
          label="Phone number"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.values?.phone ?? phone}
          error={state.fieldErrors?.phone}
          required
        />

        <FormActions>
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </FormActions>
      </FormGrid>
    </form>
  );
}

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateEmail, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email ?? currentEmail}
          error={state.fieldErrors?.email}
          hint="Changing this sends a confirmation link to the new address. Your login stays the same until you follow it."
          required
        />

        <FormActions>
          <SubmitButton pendingLabel="Sending…" variant="ghost">
            Update email
          </SubmitButton>
        </FormActions>
      </FormGrid>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePassword, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

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
          error={state.fieldErrors?.confirmPassword}
          required
        />

        <FormActions>
          <SubmitButton pendingLabel="Updating…" variant="ghost">
            Change password
          </SubmitButton>
        </FormActions>
      </FormGrid>
    </form>
  );
}
