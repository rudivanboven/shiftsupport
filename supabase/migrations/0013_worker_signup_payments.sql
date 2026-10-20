-- ============================================================================
--  ShiftSupport — Migration 0013
--  Worker signup payments: the $1 one-time signup fee that replaces the
--  $18/year membership subscription for new workers.
--
--  SAFETY NOTES
--    * ADDITIVE ONLY: one new table. No existing table, column, policy,
--      function or row is touched. Every statement is idempotent — re-running
--      the file is safe.
--    * Existing $18/year subscribers are NOT affected. Their `workers` rows
--      (stripe_subscription_id, membership_expires_at, …) are left exactly as
--      they are and keep following the subscription webhooks.
--    * Marketplace access still lives on `workers.membership_status` /
--      `membership_expires_at`, still written only by server-side Stripe
--      fulfillment. A worker who pays the one-time fee is stored as `active`
--      with NO expiry — the same shape migration 0008 uses for grandfathered
--      workers — so `membership_grants_access()` and the RLS policies that
--      call it need no change.
--    * This table is the ledger of one-time signup payments: what the Super
--      Admin shows as a paid membership, what the worker's Pricing page
--      shows as "paid", and the proof that lets fulfillment refuse to let an
--      older subscription's cancellation take that access away.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

-- ============================================================================
-- 1. WORKER_SIGNUP_PAYMENTS — one row per Stripe Checkout session
-- ============================================================================

-- `worker_id` is nullable and SET NULL on delete, not CASCADE: this is a
-- financial record of a real Stripe charge. `workers.auth_user_id` cascades
-- from `auth.users` (migration 0001), so deleting an account in the Supabase
-- dashboard would otherwise erase the payment history with it. An orphaned
-- row keeps its Stripe ids, amount and date — the same stance the audit log
-- in migration 0010 takes.
create table if not exists public.worker_signup_payments (
  id                         uuid primary key default gen_random_uuid(),
  worker_id                  uuid
                             constraint worker_signup_payments_worker_id_fkey
                             references public.workers(id) on delete set null,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id   text,
  stripe_customer_id         text,
  amount_cents               integer not null,
  currency                   text not null default 'usd',
  status                     text not null default 'pending',
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- If an earlier draft of this file (worker_id NOT NULL, ON DELETE CASCADE)
-- was applied to a non-production database, bring it in line. No-op otherwise.
alter table public.worker_signup_payments alter column worker_id drop not null;
alter table public.worker_signup_payments
  drop constraint if exists worker_signup_payments_worker_id_fkey;
alter table public.worker_signup_payments
  add constraint worker_signup_payments_worker_id_fkey
  foreign key (worker_id) references public.workers(id) on delete set null;

alter table public.worker_signup_payments
  drop constraint if exists worker_signup_payments_status_check;
alter table public.worker_signup_payments
  add constraint worker_signup_payments_status_check
  check (status in ('pending', 'paid', 'failed', 'canceled'));

-- A Checkout session belongs to exactly one row: a replayed webhook updates
-- the same row instead of recording a second payment.
create unique index if not exists worker_signup_payments_session_key
  on public.worker_signup_payments (stripe_checkout_session_id);

create index if not exists worker_signup_payments_worker_id_idx
  on public.worker_signup_payments (worker_id);

create index if not exists worker_signup_payments_paid_at_idx
  on public.worker_signup_payments (paid_at desc);

-- ============================================================================
-- 2. ACCESS — readable by the worker it belongs to; written only server-side
-- ============================================================================

alter table public.worker_signup_payments enable row level security;

-- A worker may read their own payment (status, amount, date) so the Pricing
-- page can show it. There is deliberately NO insert / update / delete policy:
-- every write happens from Stripe-verified fulfillment with the service role.
drop policy if exists worker_signup_payments_select_own on public.worker_signup_payments;
create policy worker_signup_payments_select_own on public.worker_signup_payments
  for select to authenticated
  using (worker_id = public.current_worker_id());

revoke all on public.worker_signup_payments from anon, authenticated;

-- The Stripe identifiers are kept from the browser the same way the
-- `workers.stripe_*` columns are (migration 0007): only the service role
-- reads them.
grant select (id, worker_id, amount_cents, currency, status, paid_at, created_at)
  on public.worker_signup_payments to authenticated;

commit;
