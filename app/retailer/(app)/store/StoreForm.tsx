"use client";

import { useActionState } from "react";
import { updateStore } from "@/app/actions/profile";
import {
  Alert,
  FormActions,
  FormGrid,
  Input,
  SubmitButton,
} from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";
import type { Store } from "@/lib/supabase/types";

export default function StoreForm({ store }: { store: Store }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateStore, {});

  return (
    <form action={formAction} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <Input
          label="Store name"
          name="storeName"
          autoComplete="organization"
          defaultValue={state.values?.storeName ?? store.name}
          error={state.fieldErrors?.storeName}
          hint="Workers see this on every shift card."
          required
        />

        <Input
          label="Store address"
          name="storeAddress"
          autoComplete="street-address"
          defaultValue={state.values?.storeAddress ?? store.address ?? ""}
          error={state.fieldErrors?.storeAddress}
          hint="Helps workers judge how far they'd have to travel."
          required
        />

        <Input
          label="Store contact phone"
          name="storePhone"
          type="tel"
          defaultValue={state.values?.storePhone ?? store.contact_phone ?? ""}
          error={state.fieldErrors?.storePhone}
          hint="Private. Only shared with a worker after you hire them for a shift."
          required
        />

        <FormActions>
          <SubmitButton pendingLabel="Saving…">Save store details</SubmitButton>
        </FormActions>
      </FormGrid>
    </form>
  );
}
