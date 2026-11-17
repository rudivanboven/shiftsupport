-- ============================================================================
--  ShiftSupport — Migration 0014
--  Membership and Stripe columns on `workers` are server-owned.
--
--  THE GAP THIS CLOSES
--    Migration 0001 grants `update` on the whole `workers` table to the
--    `authenticated` role, and `workers_update_own` lets a worker update their
--    own row. Nothing pinned the membership columns added by 0007. So a worker
--    holding their own session token could send
--      PATCH /rest/v1/workers?id=eq.<own id>
--      {"membership_status":"active","membership_expires_at":null}
--    and `worker_membership_active()` — which reads exactly those columns —
--    would grant marketplace access without any payment. The Super Admin
--    would have shown them as "Complimentary".
--
--  THE FIX — two independent layers
--    1. Column privileges. The table-wide UPDATE grant is replaced with an
--       UPDATE grant on the profile columns only. PostgREST refuses an update
--       that names a protected column with 42501 (permission denied), so
--       tampering is loud, not silent.
--    2. A BEFORE INSERT OR UPDATE trigger that, for any API role, pins the
--       protected columns to what the row already holds (or to "no
--       membership" on insert). Same pattern as `enforce_shift_payment_state`
--       in 0007 §6 and the series guard in 0012. It stays in force even if a
--       future migration widens the grants again.
--
--  WHO KEEPS WRITING THESE COLUMNS
--    * Server-side code using the service role: Stripe fulfillment
--      (`lib/stripe/fulfillment.ts`), `ensureCustomer` in
--      `app/actions/billing.ts`, signup provisioning in `app/actions/auth.ts`.
--      The service role is not `authenticated`, so neither layer touches it.
--    * Operators in the Supabase SQL editor (role `postgres`), e.g. a future
--      re-run of 0008. Also untouched.
--    * SECURITY DEFINER functions owned by postgres (e.g. `hire_applicant`).
--      They run as their owner, so they are untouched too.
--
--  WHAT STAYS EXACTLY AS IT IS
--    * Worker profile editing (`app/actions/profile.ts` updates full_name,
--      phone, email, updated_at) — those columns stay granted.
--    * Legacy $18/year subscribers, grandfathered (0008) workers, one-time
--      payers (0013): no row is read or changed by this file.
--    * Retailer tables, policies and functions: untouched.
--    * `workers_select_*`, `workers_insert_own`, `workers_update_own` RLS
--      policies: untouched. RLS still decides WHICH rows a worker may update;
--      this migration decides WHICH COLUMNS.
--
--  SAFETY
--    * No data is modified. Idempotent — safe to re-run.
--    * If an unexpected profile column turns out to be updated from the
--      browser, the symptom is a 42501 error on that update, never silent
--      data loss; add the column to the grant in §2 and re-run.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
--  Then run:     supabase/verification/0014_verify_membership_protection.sql
-- ============================================================================

begin;

-- ============================================================================
-- 1. TRIGGER — protected columns are pinned for API roles
-- ============================================================================

create or replace function public.enforce_worker_membership_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Only the PostgREST roles are constrained. The service role (server code),
  -- the SQL editor (postgres) and SECURITY DEFINER functions pass straight
  -- through. `current_user` is the role PostgREST switched to for this
  -- request, so it cannot be spoofed by a JWT claim.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A worker row created from a session starts with no membership and no
    -- Stripe identity, whatever the request said.
    new.stripe_customer_id              := null;
    new.stripe_subscription_id          := null;
    new.membership_status               := 'inactive';
    new.membership_started_at           := null;
    new.membership_expires_at           := null;
    new.membership_cancel_at_period_end := false;
    new.membership_updated_at           := null;
    return new;
  end if;

  -- UPDATE: membership and billing facts are server-owned. Keep whatever the
  -- row already says, silently — a full-row round-trip from a client must not
  -- fail just because it echoed these columns back unchanged.
  new.stripe_customer_id              := old.stripe_customer_id;
  new.stripe_subscription_id          := old.stripe_subscription_id;
  new.membership_status               := old.membership_status;
  new.membership_started_at           := old.membership_started_at;
  new.membership_expires_at           := old.membership_expires_at;
  new.membership_cancel_at_period_end := old.membership_cancel_at_period_end;
  new.membership_updated_at           := old.membership_updated_at;

  return new;
end;
$$;

-- No EXECUTE revoke on purpose: a trigger function cannot be called directly
-- ("trigger functions can only be called as triggers"), and leaving the
-- default in place guarantees the trigger can never fail to fire for a
-- profile update because of a privilege check.

drop trigger if exists workers_enforce_membership_state on public.workers;
create trigger workers_enforce_membership_state
  before insert or update on public.workers
  for each row execute function public.enforce_worker_membership_state();

-- ============================================================================
-- 2. COLUMN PRIVILEGES — the API may update profile columns only
--
--    Replaces the table-wide `grant insert, update on public.workers to
--    authenticated` from 0001 (§9) for UPDATE. INSERT is left as it was:
--    the trigger above resets the protected columns on any API insert, and
--    signup provisioning runs with the service role anyway.
-- ============================================================================

revoke update on public.workers from authenticated;

grant update (full_name, email, phone, updated_at)
  on public.workers to authenticated;

-- `anon` never had write access; make that explicit and durable.
revoke insert, update, delete on public.workers from anon;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (only if a legitimate profile update starts failing with 42501 and
-- cannot wait for a re-run with the column added). Restores the 0001 grant;
-- the trigger alone still blocks membership tampering.
-- ----------------------------------------------------------------------------
--
-- grant update on public.workers to authenticated;
--
-- To remove everything this file added:
-- drop trigger if exists workers_enforce_membership_state on public.workers;
-- drop function if exists public.enforce_worker_membership_state();
-- grant update on public.workers to authenticated;
