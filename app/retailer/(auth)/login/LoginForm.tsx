"use client";

import { useActionState } from "react";
import { signInRetailer } from "@/app/actions/auth";
import {
  Alert,
  FormGrid,
  Input,
  PasswordInput,
  SubmitButton,
} from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";
import { AuthLockIcon, AuthMailIcon } from "@/components/auth/AuthFieldIcons";
import styles from "@/components/auth/AuthLayout.module.css";

export default function RetailerLoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(signInRetailer, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <input type="hidden" name="next" value={next ?? ""} />

        <Input
          leadingIcon={<AuthMailIcon />}
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourstore.com"
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

        <div className={styles.crossLink}>
          <a href="/forgot-password">Forgot your password?</a>
        </div>

        <SubmitButton block pendingLabel="Signing you in…">
          Log in <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
