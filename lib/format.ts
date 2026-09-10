const NL = "en-GB";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return parse(value).toLocaleDateString(NL, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  return parse(value).toLocaleDateString(NL, {
    day: "numeric",
    month: "short",
  });
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return parse(value).toLocaleTimeString(NL, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return `${formatDate(value)} · ${formatTime(value)}`;
}

const CURRENCY = "USD";

/**
 * `narrowSymbol` keeps this as "$112.42" rather than en-GB's default
 * "US$112.42", while leaving date formatting on the same locale as before.
 */
const money = (value: number, fractionDigits: number) =>
  new Intl.NumberFormat(NL, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
  }).format(value);

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "Rate on request";
  return money(value, value % 1 === 0 ? 0 : 2);
}

/**
 * Just the currency symbol, taken from the same formatter as the amounts, so
 * a badge showing "$" cannot drift away from what the numbers next to it say.
 */
export function currencySymbol() {
  return (
    new Intl.NumberFormat(NL, {
      style: "currency",
      currency: CURRENCY,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "$"
  );
}

export function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "Rate on request";
  return `${formatMoney(value)}/hr`;
}

export function formatDuration(hours: number | null | undefined) {
  if (hours === null || hours === undefined) return "—";
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (whole && minutes) return `${whole}h ${minutes}m`;
  if (whole) return `${whole}h`;
  return `${minutes}m`;
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return "";
  const then = parse(value).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(value);
}

export function initialsOf(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function firstNameOf(name: string | null | undefined) {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0];
}

export const isPast = (value: string | null | undefined) =>
  Boolean(value) && parse(value!).getTime() < Date.now();

/**
 * `shifts.start_time` / `end_time` are `timestamp without time zone`: they are
 * wall-clock times at the store ("Tuesday, 14:00"), not instants. Parsing them
 * with `new Date(string)` would shift them by the viewer's UTC offset, so the
 * date parts are read out literally instead. Values that DO carry an offset
 * (applied_at, created_at, notifications) are genuine instants and are parsed
 * normally.
 *
 * A side benefit: the server and the browser render identical digits, so there
 * are no hydration mismatches.
 */
function parse(value: string): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return new Date(value);

  const [, y, mo, d, h, mi, s] = match;
  return new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0));
}

export function totalPay(rate: number | null, duration: number | null) {
  if (rate === null || rate === undefined || duration === null || duration === undefined) {
    return null;
  }
  return rate * duration;
}
