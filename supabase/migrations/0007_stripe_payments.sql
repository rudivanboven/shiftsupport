-- ============================================================================
--  ShiftSupport — Migration 0007
--  Stripe payments: worker membership subscriptions + retailer shift payments
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. No table is dropped, no row is deleted, no column is
--      removed. Every statement is idempotent and safe to re-run.
--    * Existing shifts are marked `payment_status = 'legacy'` — they predate
--      Stripe and keep working exactly as they do today. Nothing is invented
--      about how they were paid for.
--    * Two existing RLS policies are replaced (shifts_select and
--      shift_applications_insert_own). Both are TIGHTENED only:
--        - a shift is visible to the marketplace once it is paid for;
--        - applying now requires an active worker membership.
--    * BEHAVIOUR CHANGE: every existing worker starts with
--      membership_status = 'inactive' and therefore cannot apply for shifts
--      until they subscribe. The business decision is to keep today's workers
--      in — run `0008_grandfather_existing_workers.sql` straight after this
--      file, which does exactly that (and is safe to re-run).
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

-- ============================================================================
-- 1. WORKERS — Stripe customer + membership state
--    The database, not the browser, is the source of truth for membership.
-- ============================================================================

alter table public.workers
  add column if not exists stripe_customer_id              text,
  add column if not exists stripe_subscription_id          text,
  add column if not exists membership_status               text not null default 'inactive',
  add column if not exists membership_started_at           timestamptz,
  add column if not exists membership_expires_at           timestamptz,
  add column if not exists membership_cancel_at_period_end boolean not null default false,
  add column if not exists membership_updated_at           timestamptz;

alter table public.workers drop constraint if exists workers_membership_status_check;
alter table public.workers
  add constraint workers_membership_status_check
  check (membership_status in ('inactive', 'active', 'past_due', 'canceled'));

-- One Stripe customer / subscription belongs to exactly one worker.
create unique index if not exists workers_stripe_customer_id_key
  on public.workers (stripe_customer_id) where stripe_customer_id is not null;

create unique index if not exists workers_stripe_subscription_id_key
  on public.workers (stripe_subscription_id) where stripe_subscription_id is not null;

-- `workers` is column-privileged (migration 0001): phone/email are not
-- selectable by the `authenticated` role. The Stripe identifiers are treated
-- the same way — they are never granted, so only the service role reads them.
-- The membership state itself is readable, which is what the dashboard shows.
grant select (membership_status, membership_started_at, membership_expires_at,
              membership_cancel_at_period_end)
  on public.workers to authenticated;

-- ============================================================================
-- 2. SHIFTS — payment state
--    Stripe identifiers deliberately live in `shift_payments` (§3), which only
--    the owning store can read; these columns are the ones every shift query
--    already selects alongside.
-- ============================================================================

alter table public.shifts
  add column if not exists payment_status    text not null default 'unpaid',
  add column if not exists amount_paid_cents integer,
  add column if not exists paid_at           timestamptz,
  add column if not exists published_at      timestamptz;

-- Shifts that existed before Stripe keep working: 'legacy' is publishable,
-- but records no payment that did not happen.
-- Re-run safe: a genuinely unpaid shift created after this migration is always
-- in 'draft', so only pre-Stripe rows can match here.
update public.shifts
   set payment_status = 'legacy'
 where payment_status = 'unpaid'
   and status <> 'draft';

alter table public.shifts drop constraint if exists shifts_payment_status_check;
alter table public.shifts
  add constraint shifts_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'legacy'));

-- `status` gains 'draft': created, not paid for, not visible to workers.
-- Whatever CHECK constraint the column carries today is replaced by a superset
-- of itself, so no existing row can be invalidated.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.shifts'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
       and pg_get_constraintdef(con.oid) not ilike '%payment_status%'
  loop
    execute format('alter table public.shifts drop constraint %I', v_name);
  end loop;
end $$;

alter table public.shifts
  add constraint shifts_status_check
  check (status in ('draft', 'open', 'filled', 'cancelled', 'completed'));

create index if not exists shifts_payment_status_idx on public.shifts (payment_status);

-- ============================================================================
-- 3. SHIFT_PAYMENTS — one Stripe Checkout payment per shift
-- ============================================================================

create table if not exists public.shift_payments (
  id                         uuid primary key default gen_random_uuid(),
  shift_id                   uuid not null references public.shifts(id) on delete cascade,
  store_id                   uuid not null references public.stores(id) on delete cascade,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id   text,
  amount_cents               integer not null,
  currency                   text not null default 'usd',
  status                     text not null default 'pending',
  hours                      numeric,
  hourly_rate                numeric,
  worker_gross_cents         integer,
  platform_portion_cents     integer,
  created_by                 uuid references auth.users(id) on delete set null,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.shift_payments drop constraint if exists shift_payments_status_check;
alter table public.shift_payments
  add constraint shift_payments_status_check
  check (status in ('pending', 'paid', 'failed', 'canceled'));

-- One shift is only ever paid for once, and a Checkout session belongs to one
-- payment row: this is what makes a replayed webhook harmless.
create unique index if not exists shift_payments_shift_id_key
  on public.shift_payments (shift_id);

create unique index if not exists shift_payments_session_key
  on public.shift_payments (stripe_checkout_session_id);

create index if not exists shift_payments_store_id_idx on public.shift_payments (store_id);

alter table public.shift_payments enable row level security;

-- Readable by the store that owns the shift. There is deliberately NO insert
-- or update policy: every write happens server-side with the service role.
drop policy if exists shift_payments_select_own_store on public.shift_payments;
create policy shift_payments_select_own_store on public.shift_payments
  for select to authenticated
  using (public.is_store_member(store_id));

revoke all on public.shift_payments from anon;
grant select on public.shift_payments to authenticated;

-- ============================================================================
-- 4. STRIPE_EVENTS — webhook idempotency ledger
--    RLS is on with no policy at all: unreachable from any browser session,
--    fully available to the service role the webhook runs with.
-- ============================================================================

create table if not exists public.stripe_events (
  id           text primary key,          -- the Stripe event id (evt_...)
  type         text not null,
  api_version  text,
  livemode     boolean,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create index if not exists stripe_events_received_at_idx
  on public.stripe_events (received_at desc);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ============================================================================
-- 5. MEMBERSHIP HELPERS
-- ============================================================================

-- Is a membership in a state that grants marketplace access?
-- 'past_due' keeps access until the period Stripe already paid for runs out;
-- 'canceled' / 'inactive' never do.
-- STABLE, not IMMUTABLE: it reads the clock. Promising immutability here would
-- let the planner fold the result into a cached plan and keep handing out
-- access after a membership had expired.
create or replace function public.membership_grants_access(
  p_status text,
  p_expires_at timestamptz
)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_status, 'inactive') in ('active', 'past_due')
     and (p_expires_at is null or p_expires_at > now());
$$;

-- The caller's own membership state. SECURITY DEFINER so it can read the
-- Stripe columns that the `authenticated` role is not granted.
create or replace function public.worker_membership_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workers w
    where w.auth_user_id = auth.uid()
      and public.membership_grants_access(w.membership_status, w.membership_expires_at)
  );
$$;

revoke all on function public.membership_grants_access(text, timestamptz) from public, anon;
revoke all on function public.worker_membership_active() from public, anon;
grant execute on function public.membership_grants_access(text, timestamptz) to authenticated;
grant execute on function public.worker_membership_active() to authenticated;

-- ============================================================================
-- 6. PAYMENT STATE IS NOT WRITABLE FROM A BROWSER
--
--    `shifts_update_own_store` lets a retailer update their own shifts, and a
--    retailer's browser holds a Supabase session — so without this trigger a
--    hand-rolled PostgREST request could publish an unpaid shift by setting
--    status='open', or claim payment by writing payment_status='paid'.
--
--    Mirrors the approach migration 0006 takes for the hourly rate: the
--    service role (server-side code only) keeps full control, everyone else
--    gets the payment columns pinned to what the database already holds.
-- ============================================================================

create or replace function public.enforce_shift_payment_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A shift created from a session always starts unpaid and unpublished.
    new.payment_status    := 'unpaid';
    new.amount_paid_cents := null;
    new.paid_at           := null;
    new.published_at      := null;
    new.status            := 'draft';
    return new;
  end if;

  -- Payment facts are server-owned: keep whatever the row already says.
  new.payment_status    := old.payment_status;
  new.amount_paid_cents := old.amount_paid_cents;
  new.paid_at           := old.paid_at;
  new.published_at      := old.published_at;

  if new.status = 'open'
     and old.status is distinct from 'open'
     and coalesce(old.payment_status, 'unpaid') not in ('paid', 'legacy') then
    raise exception 'This shift cannot be published until its payment is complete.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_enforce_payment_state on public.shifts;
create trigger shifts_enforce_payment_state
  before insert or update on public.shifts
  for each row execute function public.enforce_shift_payment_state();

-- ============================================================================
-- 7. RLS — an unpaid shift is not a marketplace shift
--
--    Same policy as migration 0003, with one added condition on the public
--    "still open to applications" branch. The store's own members, the hired
--    worker and previous applicants keep seeing their shifts exactly as before.
-- ============================================================================

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select to authenticated
  using (
    public.is_store_member(store_id)
    or (accepted_by is not null and accepted_by = public.current_worker_id())
    or public.worker_has_applied_to_shift(id)
    or (
      status = 'open'
      and accepted_by is null
      and payment_status in ('paid', 'legacy')
    )
  );

-- The same rule for the helper the INSERT policy on applications uses, so a
-- worker cannot apply to a shift that has not been paid for.
create or replace function public.worker_can_apply_to_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shifts s
    where s.id = p_shift_id
      and s.status = 'open'
      and s.accepted_by is null
      and s.payment_status in ('paid', 'legacy')
  );
$$;

-- ============================================================================
-- 8. RLS — applying requires an active membership
--    Enforced at the table, not just in the server action, so a direct
--    PostgREST insert from an unpaid worker's session is refused too.
-- ============================================================================

drop policy if exists shift_applications_insert_own on public.shift_applications;
create policy shift_applications_insert_own on public.shift_applications
  for insert to authenticated
  with check (
    worker_id = public.current_worker_id()
    and status = 'pending'
    and public.worker_can_apply_to_shift(shift_id)
    and public.worker_membership_active()
  );

commit;

-- Tell PostgREST to pick up the new columns/functions immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- 9. NEXT STEP
--
--    Existing workers are 'inactive' at this point. Run
--    `0008_grandfather_existing_workers.sql` next to keep the workers who
--    joined before memberships existed — that file holds the backfill, with
--    the guards that make it safe to re-run.
-- ============================================================================
