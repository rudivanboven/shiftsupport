-- ============================================================================
--  ShiftSupport — Migration 0016
--  Automated Email Workflows: Worker Welcome, Retailer Welcome, and 14-Day
--  Retailer First-Shift Follow-up Reminders.
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. No existing table, column, row, policy, trigger or
--      function is modified or dropped.
--    * Safe to re-run: every statement is idempotent.
--    * Reversible: rollback statements are documented at the bottom of this file.
--    * RLS is enabled on both new tables with no write policy for `anon` or
--      `authenticated`; all writes happen server-side via `service_role` or
--      database triggers.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. EMAIL_WORKFLOW_DELIVERIES — idempotency & delivery audit ledger
-- ============================================================================

create table if not exists public.email_workflow_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  idempotency_key      text not null,
  email_type           text not null,
  recipient_role       text not null,
  user_id              uuid references auth.users(id) on delete set null,
  worker_id            uuid references public.workers(id) on delete set null,
  store_id             uuid references public.stores(id) on delete set null,
  recipient_email      text not null,
  subject              text not null,
  reminder_sequence    integer,
  status               text not null default 'pending',
  attempt_count        integer not null default 1,
  provider             text,
  provider_message_id  text,
  last_error           text,
  sent_at              timestamptz,
  last_attempt_at      timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_workflow_deliveries_type_check'
      and conrelid = 'public.email_workflow_deliveries'::regclass
  ) then
    alter table public.email_workflow_deliveries
      add constraint email_workflow_deliveries_type_check
      check (email_type in ('worker_welcome', 'retailer_welcome', 'retailer_shift_reminder'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_workflow_deliveries_role_check'
      and conrelid = 'public.email_workflow_deliveries'::regclass
  ) then
    alter table public.email_workflow_deliveries
      add constraint email_workflow_deliveries_role_check
      check (recipient_role in ('worker', 'retailer'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_workflow_deliveries_status_check'
      and conrelid = 'public.email_workflow_deliveries'::regclass
  ) then
    alter table public.email_workflow_deliveries
      add constraint email_workflow_deliveries_status_check
      check (status in ('pending', 'sent', 'failed', 'skipped'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_workflow_deliveries_role_match_check'
      and conrelid = 'public.email_workflow_deliveries'::regclass
  ) then
    alter table public.email_workflow_deliveries
      add constraint email_workflow_deliveries_role_match_check
      check (
        (email_type = 'worker_welcome' and recipient_role = 'worker')
        or (email_type in ('retailer_welcome', 'retailer_shift_reminder') and recipient_role = 'retailer')
      );
  end if;
end $$;

-- Primary idempotency guarantee across all automated email workflows.
create unique index if not exists email_workflow_deliveries_idempotency_key
  on public.email_workflow_deliveries (idempotency_key);

-- Additional at-most-once guards per user / store step when status = 'sent'.
create unique index if not exists email_workflow_deliveries_worker_welcome_sent_idx
  on public.email_workflow_deliveries (user_id)
  where email_type = 'worker_welcome' and status = 'sent' and user_id is not null;

create unique index if not exists email_workflow_deliveries_retailer_welcome_sent_idx
  on public.email_workflow_deliveries (user_id)
  where email_type = 'retailer_welcome' and status = 'sent' and user_id is not null;

create unique index if not exists email_workflow_deliveries_retailer_reminder_sent_idx
  on public.email_workflow_deliveries (store_id, reminder_sequence)
  where email_type = 'retailer_shift_reminder' and status = 'sent' and store_id is not null;

create index if not exists email_workflow_deliveries_store_idx
  on public.email_workflow_deliveries (store_id, created_at desc);

create index if not exists email_workflow_deliveries_user_idx
  on public.email_workflow_deliveries (user_id, created_at desc);

alter table public.email_workflow_deliveries enable row level security;
revoke all on public.email_workflow_deliveries from anon, authenticated;

-- ============================================================================
-- 2. RETAILER_ONBOARDING_REMINDERS — 14-day first-shift reminder state
-- ============================================================================

create table if not exists public.retailer_onboarding_reminders (
  store_id               uuid primary key references public.stores(id) on delete cascade,
  auth_user_id           uuid references auth.users(id) on delete set null,
  registered_at          timestamptz not null default now(),
  reminders_sent_count   integer not null default 0,
  last_reminder_sent_at  timestamptz,
  next_reminder_due_at   timestamptz not null default (now() + interval '14 days'),
  first_shift_posted_at  timestamptz,
  stopped_at             timestamptz,
  stopped_reason         text,
  last_error             text,
  last_attempt_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_onboarding_reminders_count_check'
      and conrelid = 'public.retailer_onboarding_reminders'::regclass
  ) then
    alter table public.retailer_onboarding_reminders
      add constraint retailer_onboarding_reminders_count_check
      check (reminders_sent_count >= 0);
  end if;
end $$;

create index if not exists retailer_onboarding_reminders_due_idx
  on public.retailer_onboarding_reminders (next_reminder_due_at)
  where stopped_at is null and first_shift_posted_at is null;

alter table public.retailer_onboarding_reminders enable row level security;
revoke all on public.retailer_onboarding_reminders from anon, authenticated;

-- ============================================================================
-- 3. TRIGGERS — automatic reminder registration & automatic stop on first shift
-- ============================================================================

-- When a retailer store_users record is inserted, initialise the 14-day reminder
-- schedule for that store.
create or replace function public.init_retailer_onboarding_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered_at timestamptz := coalesce(new.created_at, now());
  v_first_shift   timestamptz;
begin
  select min(s.created_at) into v_first_shift
    from public.shifts s
   where s.store_id = new.store_id;

  insert into public.retailer_onboarding_reminders (
    store_id,
    auth_user_id,
    registered_at,
    reminders_sent_count,
    next_reminder_due_at,
    first_shift_posted_at,
    stopped_at,
    stopped_reason
  ) values (
    new.store_id,
    new.auth_user_id,
    v_registered_at,
    0,
    v_registered_at + interval '14 days',
    v_first_shift,
    case when v_first_shift is not null then now() else null end,
    case when v_first_shift is not null then 'first_shift_posted' else null end
  )
  on conflict (store_id) do nothing;

  return new;
end;
$$;

revoke all on function public.init_retailer_onboarding_reminder() from public, anon, authenticated;

drop trigger if exists store_users_init_onboarding_reminder on public.store_users;
create trigger store_users_init_onboarding_reminder
  after insert on public.store_users
  for each row execute function public.init_retailer_onboarding_reminder();

-- When a store posts its first shift, immediately stop all future onboarding reminders.
create or replace function public.stop_retailer_reminders_on_first_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.retailer_onboarding_reminders
     set first_shift_posted_at = coalesce(first_shift_posted_at, new.created_at, now()),
         stopped_at            = coalesce(stopped_at, now()),
         stopped_reason        = coalesce(stopped_reason, 'first_shift_posted'),
         updated_at            = now()
   where store_id = new.store_id
     and (first_shift_posted_at is null or stopped_at is null);

  return new;
end;
$$;

revoke all on function public.stop_retailer_reminders_on_first_shift() from public, anon, authenticated;

drop trigger if exists shifts_stop_retailer_reminders on public.shifts;
create trigger shifts_stop_retailer_reminders
  after insert on public.shifts
  for each row execute function public.stop_retailer_reminders_on_first_shift();

-- ============================================================================
-- 4. BACKFILL — initialise reminder schedules for existing retailer stores
-- ============================================================================

insert into public.retailer_onboarding_reminders (
  store_id,
  auth_user_id,
  registered_at,
  reminders_sent_count,
  next_reminder_due_at,
  first_shift_posted_at,
  stopped_at,
  stopped_reason
)
select
  s.id as store_id,
  su.auth_user_id,
  coalesce(su.created_at, s.created_at, now()) as registered_at,
  0 as reminders_sent_count,
  coalesce(su.created_at, s.created_at, now()) + interval '14 days' as next_reminder_due_at,
  first_sh.first_created_at as first_shift_posted_at,
  case when first_sh.first_created_at is not null then now() else null end as stopped_at,
  case when first_sh.first_created_at is not null then 'first_shift_posted' else null end as stopped_reason
from public.stores s
join lateral (
  select su_inner.auth_user_id, su_inner.created_at
    from public.store_users su_inner
   where su_inner.store_id = s.id
   order by case when su_inner.role = 'owner' then 0 else 1 end, su_inner.created_at asc
   limit 1
) su on true
left join lateral (
  select coalesce(min(sh.created_at), now()) as first_created_at
    from public.shifts sh
   where sh.store_id = s.id
  having count(*) > 0
) first_sh on true
on conflict (store_id) do nothing;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (only if this migration ever needs to be reverted)
-- ============================================================================
--
-- drop trigger if exists shifts_stop_retailer_reminders on public.shifts;
-- drop function if exists public.stop_retailer_reminders_on_first_shift();
-- drop trigger if exists store_users_init_onboarding_reminder on public.store_users;
-- drop function if exists public.init_retailer_onboarding_reminder();
-- drop table if exists public.retailer_onboarding_reminders;
-- drop table if exists public.email_workflow_deliveries;
