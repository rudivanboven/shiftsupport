# Database setup

The migrations have to be run before the app will work. Every one is **additive
and idempotent** — no table is dropped, no row is deleted, no Memberstack
column is removed, and re-running them is safe.

## How to run them

1. Open the [Supabase dashboard](https://supabase.com/dashboard) for this
   project → **SQL Editor** → **New query**.
2. Paste the whole of `migrations/0001_supabase_auth_architecture.sql`, run it.
3. Paste the whole of `migrations/0002_hire_and_reject_rpc.sql`, run it.
4. Then `0003`, `0004` and `0005` in order, the same way.

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
