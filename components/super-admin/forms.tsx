"use client";

import { useActionState, useState } from "react";

import {
  grantSuperAdminAction,
  recordShiftHoursAction,
  reviewShiftHoursAction,
  setPayrollStatusAction,
  setWorkerPayrollIdAction,
  revokeSuperAdminAction,
} from "@/app/actions/super-admin";
import { Alert, FormGrid, FormRow, Input, SubmitButton, Textarea } from "@/components/ui/Form";
import type { FormState } from "@/lib/validation";
import styles from "./Admin.module.css";

/* ------------------------------------------------------------ admin access */

export function GrantAdminForm() {
  const [state, action] = useActionState<FormState, FormData>(grantSuperAdminAction, {});

  return (
    <form action={action} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <FormRow>
          <Input
            label="Operations account email"
            name="email"
            type="email"
            placeholder="name@shiftsupport.net"
            defaultValue={state.values?.email}
            error={state.fieldErrors?.email}
            hint="The login must already exist and must not be a worker or retailer account."
            required
          />
          <Input label="Note" name="note" maxLength={300} optional defaultValue={state.values?.note} hint="Why this person needs access." />
        </FormRow>

        <SubmitButton pendingLabel="Granting…">Grant Super Admin access</SubmitButton>
      </FormGrid>
    </form>
  );
}

export function RevokeAdminForm({ userId, email }: { userId: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(revokeSuperAdminAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <button type="button" className={styles.contactBtn} onClick={() => setOpen(true)}>
          Revoke access
        </button>
      </>
    );
  }

  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="userId" value={userId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className={styles.filterLabel} htmlFor={`reason-${userId}`}>
        Reason
      </label>
      <input id={`reason-${userId}`} name="reason" className={styles.control} maxLength={300} placeholder={`Why ${email} is losing access`} />
      <div className={styles.btnRow}>
        <SubmitButton small variant="danger" pendingLabel="Revoking…">
          Confirm revoke
        </SubmitButton>
        <button type="button" className={styles.contactBtn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ payroll id */

export function WorkerPayrollIdForm({ workerId, value }: { workerId: string; value: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(setWorkerPayrollIdAction, {});

  return (
    <form action={action} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <input type="hidden" name="workerId" value={workerId} />
        <Input
          label="ADP employee id"
          name="employeeId"
          defaultValue={state.values?.employeeId ?? value ?? ""}
          error={state.fieldErrors?.employeeId}
          optional
          hint="Used in the payroll export. Leave blank to clear — the exact ADP identifier is still to be confirmed with the client."
          maxLength={64}
        />
        <SubmitButton small pendingLabel="Saving…">
          Save employee id
        </SubmitButton>
      </FormGrid>
    </form>
  );
}

/* ------------------------------------------------------------ worked hours */

export function RecordHoursForm({
  shiftId,
  defaultStart,
  defaultEnd,
  scheduledHours,
  existing,
}: {
  shiftId: string;
  defaultStart: string;
  defaultEnd: string;
  scheduledHours: number;
  existing?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(recordShiftHoursAction, {});

  return (
    <form action={action} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <input type="hidden" name="shiftId" value={shiftId} />

        <div className={styles.formRow3}>
          <Input
            label="Actual start"
            name="actualStart"
            type="datetime-local"
            defaultValue={state.values?.actualStart ?? defaultStart}
            error={state.fieldErrors?.actualStart}
            required
          />
          <Input
            label="Actual end"
            name="actualEnd"
            type="datetime-local"
            defaultValue={state.values?.actualEnd ?? defaultEnd}
            error={state.fieldErrors?.actualEnd}
            required
          />
          <Input
            label="Unpaid break (min)"
            name="breakMinutes"
            type="number"
            min={0}
            max={720}
            step={1}
            defaultValue={state.values?.breakMinutes ?? "0"}
            error={state.fieldErrors?.breakMinutes}
          />
        </div>

        <Textarea
          label="Source of these hours"
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={state.values?.note ?? ""}
          error={state.fieldErrors?.note}
          hint={`Scheduled was ${scheduledHours} h. Record what actually happened and who confirmed it.`}
          required
        />

        <SubmitButton small pendingLabel="Saving…">
          {existing ? "Replace recorded hours" : "Record worked hours"}
        </SubmitButton>
      </FormGrid>
    </form>
  );
}

export function ReviewHoursForm({
  shiftId,
  reportedHours,
  canApprove,
  blockedReason,
}: {
  shiftId: string;
  reportedHours: number | null;
  canApprove: boolean;
  blockedReason?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(reviewShiftHoursAction, {});

  return (
    <form action={action} noValidate>
      <FormGrid>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        {!canApprove && blockedReason ? <Alert tone="info">{blockedReason}</Alert> : null}
        <input type="hidden" name="shiftId" value={shiftId} />

        <FormRow>
          <Input
            label="Approved hours"
            name="approvedHours"
            type="number"
            min={0.25}
            max={24}
            step={0.25}
            defaultValue={state.values?.approvedHours ?? (reportedHours ?? "")}
            error={state.fieldErrors?.approvedHours}
            hint="Defaults to the recorded hours. Adjust only with a reason."
          />
          <Input label="Note" name="note" maxLength={500} optional defaultValue={state.values?.note} error={state.fieldErrors?.note} />
        </FormRow>

        <div className={styles.btnRow}>
          <button type="submit" name="decision" value="approve" className={`${styles.contactBtn} ${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled={!canApprove}>
            Approve for payroll
          </button>
          <button type="submit" name="decision" value="reject" className={`${styles.contactBtn} ${styles.actionBtn}`}>
            Reject hours
          </button>
        </div>
      </FormGrid>
    </form>
  );
}

/* ------------------------------------------------------------ payroll status */

export function PayrollStatusForm({
  shiftIds,
  status,
  label,
  needsRef,
  needsError,
}: {
  shiftIds: string[];
  status: "ready" | "submitted" | "processed" | "error";
  label: string;
  needsRef?: boolean;
  needsError?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(setPayrollStatusAction, {});

  return (
    <form action={action} className={styles.inlineForm}>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {shiftIds.map((id) => (
        <input key={id} type="hidden" name="shiftId" value={id} />
      ))}
      <input type="hidden" name="status" value={status} />
      {needsRef ? (
        <input name="externalRef" className={styles.control} maxLength={200} placeholder="ADP batch / reference (optional)" />
      ) : null}
      {needsError ? <input name="errorText" className={styles.control} maxLength={500} placeholder="What went wrong" required /> : null}
      <SubmitButton small variant={status === "error" ? "danger" : "ghost"} pendingLabel="Updating…" disabled={shiftIds.length === 0}>
        {label}
        {shiftIds.length ? ` (${shiftIds.length})` : ""}
      </SubmitButton>
    </form>
  );
}
