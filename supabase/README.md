# Database setup

The migrations have to be run before the app will work. Every one is **additive
and idempotent** — no table is dropped, no row is deleted, no Memberstack
column is removed, and re-running them is safe.

## How to run them

1. Open the [Supabase dashboard](https://supabase.com/dashboard) for this
   project → **SQL Editor** → **New query**.
2. Paste the whole of `migrations/0001_supabase_auth_architecture.sql`, run it.
3. Paste the whole of `migrations/0002_hire_and_reject_rpc.sql`, run it.
4. Then `0003`, `0004`, `0005`, `0006`, `0007`, `0008`, `0009` and `0010` in
   order, the same way.

(Or, with the CLI linked to this project: `supabase db push`.)

## What 0001 does

| Area | Change |
| --- | --- |
| `profiles` | Adds `email`, `phone`, `avatar_url`, `updated_at`. Links `profiles.id → auth.users.id`. Constrains `role` to `worker` / `retailer` / `admin`. |
| `workers` | Adds `auth_user_id → auth.users(id)`, `email`, `updated_at`. Makes the legacy `memberstack_id` **nullable** so new signups can be inserted — existing values are untouched. |
| `store_users` | Adds `auth_user_id → auth.users(id)`, `updated_at`. Makes legacy `memberstack_id` nullable and defaults `role` to `owner`. |
| `stores` | Adds `updated_at`. |
| `shifts` | Adds `description`, `created_by`, `updated_at`, plus indexes on `store_id` / `status` / `accepted_by` / `start_time`. |
| `shift_applications` | Adds a **unique index on (shift_id, worker_id)** so a worker cannot apply twice. Defaults `status` to `pending`. |
| `notifications` | New table. |
| RLS | Enabled on every table, with policies (see below). |

## What 0002 does

Creates two `SECURITY DEFINER` functions that make hiring transaction-safe:

- `hire_applicant(application_id)` — takes a row lock on the shift, re-checks
  that the caller runs the store, verifies the shift is still open and unfilled,
  then in one transaction: approves the application, sets `shifts.accepted_by`,
  flips the shift to `filled`, auto-declines every other pending applicant, and
  writes the notifications. **Two simultaneous hires cannot both succeed** — the
  second blocks on the lock and then fails the `accepted_by` check.
- `reject_application(application_id, reason)` — same authorisation check, marks
  the application rejected, stamps `reviewed_at`, notifies the worker.

## What 0005 does

Adds the two-way review system. Additive and idempotent like the others.

| Area | Change |
| --- | --- |
| `shifts` | Adds `completed_at timestamptz`. Nothing else on the table changes. Shifts already flagged `completed` are backfilled with their `end_time`. |
| `reviews` | New table: one row per direction per shift, `rating` constrained to 1–5, `reviewer_role`/`reviewee_role` constrained to `worker`/`retailer`. A **unique index on (shift_id, reviewer_role)** is what stops a second review in the same direction. |
| `complete_shift(shift_id)` | The store confirms a finished shift actually happened. Stamps `completed_at`, which starts the review clock. Idempotent, so the clock cannot be restarted. |
| `submit_review(shift_id, rating, comment)` | The only way a row reaches `reviews`. Derives reviewer, reviewee and direction from `auth.uid()` and the shift itself, and refuses until `completed_at + 3 days`. |
| `get_shift_review_state(shift_ids[])` | Per-shift review state for the two participants — including `can_review`, decided against the database clock. |
| `worker_rating` / `store_rating` | Averages over real reviews in the correct direction only. |
| `get_worker_reviews` / `get_store_reviews` | Per-job review history. |
| `get_top_rated_workers(limit)` | Retailer-only, ordered by average then review count. |
| RLS | `reviews` has a SELECT policy for the two parties plus the shift's store, and **no INSERT/UPDATE/DELETE policy at all** — so reviews can only be created through `submit_review`, and are permanent once written. |

The 3-day wait lives in one place, `public.review_delay()`. The UI renders a
countdown from `review_opens_at`, but the browser clock never authorises
anything: `submit_review` re-checks the window server-side on every call.

## The security model

Role comes from `profiles.role` and is checked server-side on every dashboard
page. It is *also* mirrored into `app_metadata.role` (writable only with the
service-role key, so a user cannot edit it) purely so middleware can do fast
redirects without a database round-trip.

**Row Level Security** covers row visibility:

- Workers can read/write only their own profile, worker record, availability and
  applications; they can see open shifts, plus any shift they applied to or were
  hired for. There is deliberately **no UPDATE policy** letting a worker touch an
  application's status — so nobody can hire themselves.
- Retailers can read/write only their own store, its shifts, and the
  applications against those shifts.

**Column privileges** cover the two privacy rules that RLS can't express,
because they are about columns rather than rows:

- `stores.contact_phone` is not selectable by any signed-in user. The retailer
  reads their own through `get_my_store()`; a worker gets it through
  `get_shift_contact(shift_id)`, which returns nothing unless they are the
  worker actually hired for that shift.
- `workers.phone` / `workers.email` are likewise not selectable. A retailer sees
  an applicant's **name** while the application is pending, and only gets contact
  details through `get_shift_worker_contact(shift_id)` after hiring them.

`shiftsupport_shifts` (the old marketing-form intake table) has RLS enabled with
no policies, so it is readable only with the service-role key.

## Legacy data

Nothing is migrated or deleted. The existing Memberstack-era rows keep their
`memberstack_id` values and simply have `auth_user_id = NULL`. If you later want
to reconnect an old worker to a new Supabase Auth login, set that row's
`auth_user_id` — no other change is needed.

## What 0007 does

Stripe payments. See `../STRIPE.md` for the setup it belongs to.

| Area | Change |
| --- | --- |
| `workers` | Adds `stripe_customer_id`, `stripe_subscription_id`, `membership_status`, `membership_started_at`, `membership_expires_at`, `membership_cancel_at_period_end`, `membership_updated_at`. The two `stripe_*` columns are **not** granted to `authenticated` — only the service role reads them. |
| `shifts` | Adds `payment_status`, `amount_paid_cents`, `paid_at`, `published_at`, and `draft` as a status. Existing shifts become `payment_status = 'legacy'` and keep working unchanged. |
| `shift_payments` | New table: one Stripe Checkout payment per shift, readable only by the owning store, written only by the service role. |
| `stripe_events` | New table: the webhook idempotency ledger, keyed by Stripe event id. RLS on with no policy, so no browser session can reach it. |
| Trigger | `shifts_enforce_payment_state` pins the payment columns for any non-service-role write and refuses to publish a shift that has not been paid for. |
| RLS | `shifts_select` only exposes an open shift to the marketplace once it is paid (or legacy). `shift_applications_insert_own` additionally requires `worker_membership_active()`. |

**Before running it:** every existing worker starts with `membership_status =
'inactive'` and cannot apply for shifts until they subscribe.

## What 0008 does

The one-time backfill that keeps them: every worker who existed before the
rollout (`created_at` before 2026-09-12, no Stripe customer, status
`inactive`) becomes `active` with no expiry date, so today's workers keep
marketplace access without paying. Workers who sign up after that date
subscribe like everyone else, and a later Stripe event for a grandfathered
worker replaces the row as normal.

Safe to re-run: the guards mean it can never re-activate a membership that has
since lapsed or been cancelled. The file also carries a commented-out
alternative that grants a grace period with a fixed end date instead of
open-ended access.

## What 0010 does

The Operations Control Center (Super Admin). Additive and idempotent: it creates
only new objects, and changes no existing table, column, policy, trigger or
function. See [`../SUPER_ADMIN.md`](../SUPER_ADMIN.md) for the whole setup.

| Area | Change |
| --- | --- |
| `super_admins` | New table: who may use `/super-admin`. Deliberately NOT a `profiles.role` value, so no signup path can produce it and the "can't edit my own role" rule is structural. RLS on, readable only by an active Super Admin, with no write policy. |
| `admin_audit_log` | New table, append-only (a trigger refuses UPDATE/DELETE): admin user, action, target, timestamp, non-sensitive metadata. |
| `admin_communications` | New table: one row per admin email attempt — recipient, subject, status, provider. Message bodies are not stored. |
| `shift_time_entries` | New table: actual start/end, unpaid break, reported hours, approval state, approved hours, and payroll status per hired shift. Readable by Super Admins, the shift's store and the hired worker; written only through the functions below. |
| `worker_payroll_identities` | New table: worker → payroll-provider employee id. No bank or tax data; ADP holds that. |
| `is_super_admin()`, `is_primary_super_admin()` | The authorisation checks. `SECURITY DEFINER`, empty `search_path`, used by the new policies and by every write function. |
| `grant_super_admin()`, `revoke_super_admin()` | Access management: primary-admin only, never self, primary and last-admin protected, worker/retailer accounts refused, audited in the same transaction. |
| `submit_shift_hours()` | Records the hours actually worked (store or Super Admin). Always lands as `submitted`; re-recording resets any approval, and a store may not overwrite hours operations has already approved. Every recording is audited, whoever made it. Scheduled duration is never copied in as payroll time. |
| `review_shift_hours()` | Super Admin approve/reject, optionally adjusting hours. Approval requires the store to have completed the shift and the hired worker to still match the recorded one, and is what makes a line payroll-ready. |
| `set_payroll_status()` | Forward-only payroll steps (`ready` → `exported` → `submitted` → `processed`, plus `error` and retry), approved lines only, audited. |
| `admin_log_action()`, `admin_record_communication()`, `set_worker_payroll_identity()` | The remaining audited admin writes. |
| `operations_time_zone()`, `operations_now()` | The store-local clock that wall-clock shift times are compared against (`start_time::timestamptz` would read them as UTC and be hours out). Mirrors `OPERATIONS_TIME_ZONE` in `lib/admin/config.ts` — change both together. |
| Column privileges | `shift_time_entries.worker_hourly_rate`, the notes and the payroll columns are not granted to `authenticated`; the store and worker see only the hours and whether they were approved. |
| RLS | New policies on the new tables only. No existing policy is touched — `workers.phone/email` and `stores.contact_phone` are column-revoked from `authenticated` anyway, and migration 0009 drops any extra SELECT policy on `shifts`. Admin reads therefore happen server-side with the service role, after `is_super_admin()` has been re-checked for that request. |

**The first Super Admin is not created by this migration.** Run migration 0011
next, and use the commented-out bootstrap block in its §2 — not the one at the
end of 0010, which is superseded (see below).

## What 0011 does

Fixes the separation check in `grant_super_admin()`. This database has a trigger
on `auth.users` that creates a `profiles` row with role `worker` for every new
auth user, so 0010's check against `profiles.role` refused every dedicated
operations login, and its bootstrap SELECT matched zero rows while the SQL
editor still said "Success".

0011 replaces that one function (created by 0010, nothing older) so the check
tests the record signup provisions instead — a `workers` row for a worker, a
`store_users` row for a retailer. In practice that is stricter: a real worker or
retailer always has one, and a fresh operations login never does. The trigger,
worker/retailer signup, login and both dashboards are untouched. It also carries
the corrected bootstrap block for the primary Super Admin.
