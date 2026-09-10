"use client";

import { useActionState } from "react";
import { signUpWorker } from "@/app/actions/auth";
import {
  Alert,
  FormGrid,
  Input,
  PasswordInput,
  SubmitButton,
} from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";
import {
  AuthLockIcon,
  AuthMailIcon,
  AuthPhoneIcon,
  AuthUserIcon,
} from "@/components/auth/AuthFieldIcons";

export default function WorkerSignupForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signUpWorker, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Input
          leadingIcon={<AuthUserIcon />}
          label="Full name"
          name="fullName"
          autoComplete="name"
          placeholder="Alex Doyle"
          defaultValue={state.values?.fullName}
          error={state.fieldErrors?.fullName}
          required
        />

        <Input
          leadingIcon={<AuthMailIcon />}
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          required
        />

        <Input
          leadingIcon={<AuthPhoneIcon />}
          label="Phone number"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+31 6 12 34 56 78"
          hint="Retailers use this to reach you once you're hired."
          defaultValue={state.values?.phone}
          error={state.fieldErrors?.phone}
          required
        />

        <PasswordInput
          leadingIcon={<AuthLockIcon />}
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={state.fieldErrors?.password}
          showStrength
          required
        />

        <PasswordInput
          leadingIcon={<AuthLockIcon shield />}
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          error={state.fieldErrors?.confirmPassword}
          required
        />

        <SubmitButton block pendingLabel="Creating your account…">
          Create worker account <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
