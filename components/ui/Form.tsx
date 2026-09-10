"use client";

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import styles from "./Form.module.css";
import type { ButtonVariant } from "./buttonClass";

/* -------------------------------------------------- layout */

export const FormGrid = ({ children }: { children: ReactNode }) => (
  <div className={styles.grid}>{children}</div>
);

export const FormRow = ({ children }: { children: ReactNode }) => (
  <div className={styles.row2}>{children}</div>
);

export const FormActions = ({ children }: { children: ReactNode }) => (
  <div className={styles.actions}>{children}</div>
);

export const FormDivider = () => <div className={styles.divider} />;

export const Fieldset = ({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) => (
  <fieldset className={styles.fieldset}>
    <legend className={styles.legend}>{legend}</legend>
    {children}
  </fieldset>
);

/* -------------------------------------------------- field wrapper */

interface BaseFieldProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, error, hint, optional, children }: BaseFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}>optional</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className={styles.error} id={errorId} role="alert">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6.1" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 4v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="10" r="0.85" fill="currentColor" />
          </svg>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------- inputs */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  leadingIcon?: ReactNode;
};

export function Input({ label, error, hint, optional, leadingIcon, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <div className={styles.inputWrap}>
          {leadingIcon ? (
            <span className={styles.leadingIcon} aria-hidden="true">
              {leadingIcon}
            </span>
          ) : null}
          <input
            {...rest}
            id={id}
            className={`${styles.input} ${leadingIcon ? styles.withLeading : ""}`}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        </div>
      )}
    </FieldShell>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export function Textarea({ label, error, hint, optional, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={id}
          className={styles.textarea}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
      )}
    </FieldShell>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
};

export function Select({ label, error, hint, optional, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <select
          {...rest}
          id={id}
          className={styles.select}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/* -------------------------------------------------- password */

const STRENGTH = [
  { label: "Too short", color: "#c0492f" },
  { label: "Weak", color: "#d08b3c" },
  { label: "Good", color: "#7aa63f" },
  { label: "Strong", color: "#2e7b3c" },
];

function scorePassword(value: string) {
  if (value.length < 8) return 0;
  let score = 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && value.length >= 10) score++;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score = 3;
  return Math.min(score, 3);
}

interface PasswordProps extends Omit<InputProps, "type"> {
  showStrength?: boolean;
}

export function PasswordInput({
  label,
  error,
  hint,
  showStrength = false,
  leadingIcon,
  onChange,
  ...rest
}: PasswordProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const score = scorePassword(value);

  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <>
          <div className={styles.inputWrap}>
            {leadingIcon ? (
              <span className={styles.leadingIcon} aria-hidden="true">
                {leadingIcon}
              </span>
            ) : null}
            <input
              {...rest}
              id={id}
              type={visible ? "text" : "password"}
              className={`${styles.input} ${styles.withReveal} ${leadingIcon ? styles.withLeading : ""}`}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setValue(event.target.value);
                onChange?.(event);
              }}
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {visible ? (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M3 10s2.7-4.6 7-4.6 7 4.6 7 4.6-2.7 4.6-7 4.6S3 10 3 10Z"
                    stroke="currentColor"
                    strokeWidth="1.35"
                  />
                  <circle cx="10" cy="10" r="1.9" stroke="currentColor" strokeWidth="1.35" />
                  <path d="m4 16 12-12" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M3 10s2.7-4.6 7-4.6 7 4.6 7 4.6-2.7 4.6-7 4.6S3 10 3 10Z"
                    stroke="currentColor"
                    strokeWidth="1.35"
                  />
                  <circle cx="10" cy="10" r="1.9" stroke="currentColor" strokeWidth="1.35" />
                </svg>
              )}
            </button>
          </div>

          {showStrength && value ? (
            <div className={styles.meter}>
              <span className={styles.meterTrack}>
                <span
                  className={styles.meterFill}
                  style={{
                    width: `${((score + 1) / 4) * 100}%`,
                    background: STRENGTH[score].color,
                  }}
                />
              </span>
              <span className={styles.meterLabel}>{STRENGTH[score].label}</span>
            </div>
          ) : null}
        </>
      )}
    </FieldShell>
  );
}

/* -------------------------------------------------- alerts */

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? styles.alertError
      : tone === "success"
        ? styles.alertSuccess
        : styles.alertInfo;

  return (
    <div
      className={`${styles.alert} ${toneClass}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className={styles.alertIcon} aria-hidden="true">
        {tone === "success" ? (
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="8.1" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="m5.6 9.2 2.2 2.2 4.6-4.7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="8.1" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 5v4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9" cy="12.6" r="0.9" fill="currentColor" />
          </svg>
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}

/* -------------------------------------------------- buttons */


export function SubmitButton({
  children,
  pendingLabel = "Please wait…",
  variant = "primary",
  block = false,
  small = false,
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  block?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={[
        styles.button,
        styles[variant],
        block ? styles.block : "",
        small ? styles.small : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
