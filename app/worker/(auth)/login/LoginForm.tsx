"use client";

import { useActionState } from "react";
import { signInWorker } from "@/app/actions/auth";
import {
  Alert,
  FormGrid,
  Input,
  PasswordInput,
  SubmitButton,
} from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";
import styles from "@/components/auth/AuthLayout.module.css";

export default function WorkerLoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(signInWorker, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <input type="hidden" name="next" value={next ?? ""} />

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

        <PasswordInput
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
