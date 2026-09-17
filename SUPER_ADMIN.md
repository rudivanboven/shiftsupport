# Operations Control Center (Super Admin)

An internal operations console at `/super-admin`, separate from the public site,
the worker dashboard and the retailer dashboard. It is additive: no existing
table, policy, route or behaviour was changed to build it.

## 1. Apply the migration

`supabase/migrations/0010_operations_control_center.sql`, then
`supabase/migrations/0011_super_admin_account_separation_fix.sql` — Supabase
Dashboard → SQL Editor → New query → paste → Run. Both are additive and
idempotent: they only create new tables, functions, policies and grants.

**0011 matters.** This database has a trigger on `auth.users` that gives every
new auth user a `profiles` row with role `worker`. 0010's separation check read
`profiles.role`, so it refused every fresh operations login and its bootstrap
INSERT silently matched zero rows. 0011 tests the record signup actually
provisions instead — a `workers` row, or a `store_users` row — which a real
worker or retailer always has and a dedicated operations login never does.

It adds:

| Object | Purpose |
| --- | --- |
| `super_admins` | Who has access. Separate table, so no signup path can grant it. |
| `admin_audit_log` | Append-only record of sensitive admin actions. |
| `admin_communications` | Metadata for admin emails (no message bodies). |
| `shift_time_entries` | Actual worked hours, approval and payroll state — one row per hired shift. |
| `worker_payroll_identities` | Worker → payroll-provider employee id mapping (empty until ADP is confirmed). |
| `is_super_admin()` / `is_primary_super_admin()` | The authorisation checks, used by policies and by every write function. |
| `grant_super_admin()` / `revoke_super_admin()` | Access management, primary-admin only, audited. |
| `submit_shift_hours()` / `review_shift_hours()` / `set_payroll_status()` | The worked-hours → payroll pipeline. |
| `admin_log_action()` / `admin_record_communication()` / `set_worker_payroll_identity()` | Audited admin writes. |

Nothing in the migration grants anyone access.

## 2. Create the first Super Admin

1. Supabase Dashboard → **Authentication → Users → Add user**. Use a dedicated
   operations email (**not** a worker or retailer login), a strong password, and
   tick *Auto confirm user*.
2. Run the commented-out block in §2 of migration **0011** with that email
   filled in. It inserts the row with `is_primary = true`, and its `returning`
   clause prints the row — if it prints nothing, it matched nothing.
3. Sign in at `/super-admin/login`.

After that, the primary Super Admin grants and revokes access from
`/super-admin/admins`.

## 3. How access is enforced

Five independent layers, none of which relies on the URL being secret:

1. **Route guard** — `requireSuperAdmin()` in the console layout: signed out →
   `/super-admin/login`; signed in without access → 404 (so the area is not even
   confirmed to exist).
2. **Per-request authorisation** — every admin data function goes through
   `adminDb()`, which re-checks access before it will hand back a service-role
   client, and every server action re-checks on its own. A rendered page is
   never treated as proof.
3. **Database RLS** — the new tables are readable only when
   `is_super_admin()` is true, and have no write policy at all.
4. **Column privileges** — on `shift_time_entries`, the rate, the free-text
   notes and the payroll plumbing are not granted to any session at all; the
   console reads them server-side. Same technique as `workers.phone` and
   `stores.contact_phone` in migration 0001.
5. **SECURITY DEFINER functions** — every admin write goes through a function
   that checks `is_super_admin()` (or `is_primary_super_admin()`) inside the
   database and writes the audit entry in the same transaction. A compromised
   server would still be refused by the database.

Access-management safeguards: only the primary admin can grant or revoke, nobody
can change their own access, the primary admin cannot be revoked from the app,
the last active admin cannot be removed, and worker/retailer accounts are
refused outright.

The admin's browser only ever holds the ordinary anon-key session. The service
role key stays on the server (`lib/supabase/admin.ts` is `server-only`), and no
Stripe, webhook or payroll secret is exposed to the client.

## 4. Scheduled vs actual hours

Scheduled duration is never treated as payroll time.

```
shift created → paid (Stripe) → published → applications → hired
   → store confirms completion → actual hours recorded → hours approved
   → ready for payroll → exported / submitted to ADP → processed
```

* `submit_shift_hours()` records actual start, end and unpaid break. Callable by
  the shift's store (`hours_source = 'retailer'`) or by operations
  (`hours_source = 'admin'`). It always lands as `submitted` — never as payroll
  time — and re-recording hours resets any previous approval.
* `review_shift_hours()` (operations only) approves or rejects, optionally
  adjusting the hours, and requires the store to have marked the shift
  completed. Approval is what sets `payroll_status = 'ready'`.
* Hours that have already been exported or submitted cannot be edited in the
  console, and a store cannot overwrite hours operations has already approved —
  it has to go through operations, so an approval cannot be reset quietly.
* **Every** recording of hours is written to the audit log, including one made
  by a store, with what it replaced.
* Approval refuses if the hired worker on the shift changed after the hours were
  recorded, so an approval can never pay the wrong person.

The retailer-facing UI for step "actual hours recorded" is **not** built yet —
the RPC accepts store members, so a control can be added to the retailer
dashboard later without schema changes. Until then operations records the hours
the store confirms, with a mandatory source note.

## 5. Payroll / ADP

ADP runs worker payroll; Stripe is not the worker payroll system. No Stripe
Connect payouts and no worker bank details exist in this app.

`/super-admin/payroll` is ADP-*ready*, not ADP-integrated: nothing calls ADP.
`lib/payroll/` defines the `PayrollProvider` boundary with an empty registry;
the only method today is a CSV export, labelled as an export everywhere.
Downloading it marks those lines `exported` and writes an audit entry; the
remaining steps (`submitted`, `processed`, `error`) are manual operator actions.

Still needed from the client before automatic submission:

* which ADP product/module (RUN, Workforce Now, Vantage, …);
* whether API access is enabled, and with which scopes;
* API credentials and any certificate/mTLS requirements (server-side only);
* how ADP identifies an employee (associate OID / worker id / file number) and
  how that maps to a ShiftSupport worker;
* the exact time-entry endpoint, pay-period rules and cut-off times;
* whether hours go through the API at all, or are uploaded/keyed manually;
* how post-submission corrections should be handled.

When known: add an adapter in `lib/payroll/` implementing `PayrollProvider`,
register it, and set `PAYROLL_PROVIDER`. The queue, statuses, approvals and
audit trail do not need to change.

## 6. Email

The app has no transactional email provider (Supabase Auth only sends its own
auth emails). None was invented. `lib/email/` defines the `EmailProvider`
contract with an **empty** registry, so the composer validates the message,
records the attempt in `admin_communications` and the audit log, and offers to
hand the message to the admin's own mail client instead.

To enable server-side sending: write an adapter in `lib/email/providers/`,
register it in `PROVIDERS`, and set the environment variables below.

## 7. Environment variables

All optional — the console works without them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPERATIONS_TIME_ZONE` | `America/Los_Angeles` | Time zone that "today" and chart buckets are counted in. Shift times are store wall-clock values, so the database has the same default in `public.operations_time_zone()` — **change both together**. |
| `OPERATIONS_DEFAULT_COUNTRY_CODE` | `1` | Country calling code assumed for 10-digit phone numbers, for `tel:`/WhatsApp links. |
| `ADMIN_EMAIL_PROVIDER` | — | Id of a registered email adapter. Without it, sending reports "not configured". |
| `ADMIN_EMAIL_FROM` | — | Verified sender address for admin email. |
| *(provider API key)* | — | Whatever the chosen email adapter needs. Server-side only, never `NEXT_PUBLIC_`. |
| `PAYROLL_PROVIDER` | `manual_csv` | Id of a registered payroll adapter. No ADP adapter exists yet. |

## 8. Routes

```
/super-admin/login          operations sign-in (Supabase Auth)
/super-admin                dashboard — live counts + trends
/super-admin/analytics      date-range analytics and charts
/super-admin/workers        worker directory  → /super-admin/workers/[id]
/super-admin/retailers      store directory   → /super-admin/retailers/[id]
/super-admin/shifts         shift operations  → /super-admin/shifts/[id]
/super-admin/applications   applications & hires
/super-admin/finance        payments, splits, transaction drill-down
/super-admin/payroll        payroll queue (+ POST /super-admin/payroll/export)
/super-admin/communications contact directory + email history
/super-admin/admins         admin access management
/super-admin/audit          audit log
```

No link to any of these appears on the public site, the worker dashboard or the
retailer dashboard, and the console is marked `noindex`.

## 9. Known limitations

* **The retailer has no UI for recording actual hours yet** (§4). The RPC
  already accepts store members.
* **`admin_audit_log` keeps `actor_email` forever.** The table is append-only by
  trigger, and deleting an auth user only nulls `actor_user_id`. If GDPR-style
  erasure has to reach the audit log, that needs a deliberate decision — today
  the log wins over erasure.
* **No user suspend/ban.** Nothing in the console changes a worker's or
  retailer's ability to log in; there is no status column for it, and adding one
  would change production auth behaviour.
* **Aggregation happens in the server process**, over a per-request snapshot of
  the operational tables. Comfortable at this data size; if the tables grow into
  the hundreds of thousands of rows, move the aggregates into SQL functions.
* **No ADP API** (§5) and **no server-side email** (§6) — both are boundaries
  with no provider wired up.

## 10. Definitions used in the numbers

* **Active worker** — applied for, or worked, a shift in the last 30 days.
* **Active store** — posted a shift in the last 30 days.
* **Paid membership** — membership grants access *and* a Stripe subscription
  exists. **Complimentary** — access without a subscription (the pre-Stripe
  workers kept by migration 0008).
* **Open shift** — `status = 'open'`, nobody hired, payment `paid` or `legacy`
  (the same rule the marketplace RLS policy uses).
* **Money** — Stripe-confirmed `shift_payments` rows only. Unpaid and draft
  shifts are never counted as revenue; open checkouts are shown separately.
  Worker gross / platform portion come from the split recorded at checkout
  (scheduled hours); where actual hours are approved, the payroll figure uses
  those instead.
* **Platform portion** — $8/hour of the $28/hour retailer rate, supporting
  employment administration, insurance, compliance, payroll-related operations
  and platform services. It is not labelled as tax or as a government fee.
