"use client";

import { useActionState } from "react";
import { signUpRetailer } from "@/app/actions/auth";
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
  AuthPinIcon,
  AuthStoreIcon,
  AuthUserIcon,
} from "@/components/auth/AuthFieldIcons";
import styles from "./SignupForm.module.css";

export default function RetailerSignupForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signUpRetailer, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <div className={styles.fieldGrid}>
            <Input
              leadingIcon={<AuthUserIcon />}
              label="Full name"
              name="fullName"
              autoComplete="name"
              placeholder="Sam Verhoeven"
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
              placeholder="you@yourstore.com"
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
              defaultValue={state.values?.phone}
              error={state.fieldErrors?.phone}
              required
            />

            <Input
              leadingIcon={<AuthStoreIcon />}
              label="Store name"
              name="storeName"
              autoComplete="organization"
              placeholder="Verhoeven Grocers"
              defaultValue={state.values?.storeName}
              error={state.fieldErrors?.storeName}
              required
            />
            <Input
              leadingIcon={<AuthPinIcon />}
              label="Store address"
              name="storeAddress"
              autoComplete="street-address"
              placeholder="Keizersgracht 121, Amsterdam"
              defaultValue={state.values?.storeAddress}
              error={state.fieldErrors?.storeAddress}
              required
            />

            <Input
              leadingIcon={<AuthPhoneIcon />}
              label="Store contact phone"
              name="storePhone"
              type="tel"
              placeholder="+31 20 123 4567"
              defaultValue={state.values?.storePhone}
              error={state.fieldErrors?.storePhone}
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
        </div>

        <SubmitButton block pendingLabel="Setting up your store…">
          Create retailer account <span aria-hidden="true">→</span>
        </SubmitButton>
      </FormGrid>
    </form>
  );
}
