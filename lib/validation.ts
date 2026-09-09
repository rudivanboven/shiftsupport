export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors = Record<string, string>;

export interface FormState {
  error?: string;
  fieldErrors?: FieldErrors;
  success?: string;
  values?: Record<string, string>;
}

export const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

export function validateEmail(email: string, errors: FieldErrors) {
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
}

export function validatePassword(
  password: string,
  confirm: string,
  errors: FieldErrors,
) {
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8)
    errors.password = "Use at least 8 characters.";
  if (!confirm) errors.confirmPassword = "Please confirm your password.";
  else if (password && password !== confirm)
    errors.confirmPassword = "Passwords do not match.";
}

export function validateRequired(
  fields: Record<string, { value: string; label: string }>,
  errors: FieldErrors,
) {
  for (const [name, { value, label }] of Object.entries(fields)) {
    if (!value) errors[name] = `${label} is required.`;
  }
}

export function validatePhone(phone: string, errors: FieldErrors, name = "phone") {
  if (!phone) {
    errors[name] = "Phone number is required.";
    return;
  }
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) errors[name] = "Enter a valid phone number.";
}
