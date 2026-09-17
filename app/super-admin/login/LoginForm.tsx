"use client";

import { useActionState } from "react";

import { signInSuperAdmin } from "@/app/actions/super-admin-auth";
import { Alert, FormGrid, Input, PasswordInput, SubmitButton } from "@/components/ui/Form";
import { AuthLockIcon, AuthMailIcon } from "@/components/auth/AuthFieldIcons";
import type { FormState } from "@/lib/validation";

export default function SuperAdminLoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signInSuperAdmin, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Input
          leadingIcon={<AuthMailIcon />}
          label="Operations email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ops@shiftsupport.net"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          required
        />

        <PasswordInput
          leadingIcon={<AuthLockIcon />}
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={state.fieldErrors?.password}
          required
        />

        <SubmitButton block pendingLabel="Checking access…">
          Sign in
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
