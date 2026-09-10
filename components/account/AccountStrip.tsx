import { signOutAction } from "@/app/actions/auth";
import {
  displayNameFor,
  getCurrentUserWithRoleSafe,
  roleLabelFor,
} from "@/lib/auth/session";
import type { UserRole } from "@/lib/supabase/types";
import styles from "./AccountStrip.module.css";

/** First letters of the display name — the avatar when there is no photo. */
function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("") || "?";
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.8 19a6.3 6.3 0 0 1 12.4 0" />
    </svg>
  );
}

/**
 * "You're signed in" banner for the public For Workers / For Retailers pages.
 *
 * `audience` is which page this is, NOT who the visitor is. The visitor's role
 * always comes from `getCurrentUserWithRole`, and the strip appears only when
 * the two match — so the retailer page never mentions a worker account (or
 * offers its dashboard), and vice versa. Renders nothing for a signed-out
 * visitor, or for one whose role belongs to the other page.
 */
export default async function AccountStrip({
  audience,
  returnTo,
}: {
  audience: UserRole;
  /** Where Log out drops them — normally the page holding the strip. */
  returnTo: string;
}) {
  const account = await getCurrentUserWithRoleSafe();
  if (!account?.role || !account.dashboardPath) return null;

  // Wrong page for this account: show nothing at all, so it reads as an
  // ordinary public page.
  if (account.role !== audience) return null;

  const name = displayNameFor(account);
  const roleLabel = roleLabelFor(account.role);

  return (
    <div className={styles.strip}>
      <span className={styles.avatar} aria-hidden="true">
        {name === "there" ? <UserIcon /> : initials(name)}
      </span>

      <div className={styles.copy}>
        <p className={styles.greeting}>Hi, {name}</p>
        <p className={styles.note}>
          You&rsquo;re signed in as a{" "}
          <span className={styles.role}>{roleLabel}</span>.
        </p>
      </div>

      <div className={styles.actions}>
        <a className={styles.primary} href={account.dashboardPath}>
          Open {roleLabel} Dashboard
        </a>

        <form action={signOutAction} className={styles.logoutForm}>
          <input type="hidden" name="redirectTo" value={returnTo} />
          <button type="submit" className={styles.secondary}>
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
