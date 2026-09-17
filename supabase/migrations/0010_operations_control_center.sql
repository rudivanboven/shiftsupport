-- ============================================================================
--  ShiftSupport — Migration 0010
--  Operations Control Center: Super Admin access, audit log, admin
--  communications, actual worked hours and payroll (ADP-ready) state.
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. No existing table, column, row, policy, trigger or
--      function is changed or dropped. Only NEW objects are created.
--    * Safe to re-run: every statement is idempotent.
--    * No existing RLS policy is touched. Super Admin pages read existing
--      tables server-side only (see "Why no new policies on existing tables").
--    * Nothing here grants anyone Super Admin. The first (primary) Super Admin
--      is bootstrapped by hand — see §9 at the bottom of this file.
--
--  Why no new policies on existing tables
--    * `workers.phone/email` and `stores.contact_phone` are column-privileged
--      away from the `authenticated` role (0001), so an RLS policy could not
--      expose them to an admin session anyway.
--    * Migration 0009 drops every SELECT policy on `shifts` other than
--      `shifts_select` if it is ever re-run, which would silently remove one.
--    * Keeping admin reads on the server means a stolen admin browser token
--      cannot bulk-read the whole database through PostgREST.
--    The admin data layer therefore authorises the caller against
--    `is_super_admin()` on every request, then reads with the service role on
--    the server only. Every admin WRITE goes through a SECURITY DEFINER
--    function below that re-checks `is_super_admin()` inside the database.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. SUPER ADMINS
--    Deliberately a separate table, not a value of profiles.role:
--      * worker/retailer signup writes profiles.role, so no signup path can
--        ever produce a row here;
--      * profiles_update_own lets a user update their own profile row — this
--        table has no write policy at all;
--      * revocation keeps history (status + revoked_at) instead of deleting.
-- ============================================================================

create table if not exists public.super_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  is_primary  boolean not null default false,
  status      text not null default 'active',
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'super_admins_status_check' and conrelid = 'public.super_admins'::regclass) then
    alter table public.super_admins add constraint super_admins_status_check
      check (status in ('active', 'revoked'));
  end if;
end $$;

-- At most one primary Super Admin.
create unique index if not exists super_admins_one_primary
  on public.super_admins (is_primary) where is_primary;

alter table public.super_admins enable row level security;
revoke all on public.super_admins from anon, authenticated;

-- The one authorisation check. SECURITY DEFINER with an empty search_path so
-- it can be used from policies without recursion or object shadowing.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.super_admins sa
    where sa.user_id = auth.uid() and sa.status = 'active'
  );
$$;

create or replace function public.is_primary_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.super_admins sa
    where sa.user_id = auth.uid() and sa.status = 'active' and sa.is_primary
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_primary_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_primary_super_admin() to authenticated;

-- Super Admins can read the admin list; nobody can write it from a session.
grant select on public.super_admins to authenticated;

drop policy if exists super_admins_select_admins on public.super_admins;
create policy super_admins_select_admins on public.super_admins
  for select to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- 2. AUDIT LOG — append-only
-- ============================================================================

create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references auth.users(id) on delete set null,
  actor_email    text,
  action         text not null,
  target_type    text,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_action_idx
  on public.admin_audit_log (action);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_user_id);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists admin_audit_log_select_admins on public.admin_audit_log;
create policy admin_audit_log_select_admins on public.admin_audit_log
  for select to authenticated
  using (public.is_super_admin());

-- Entries can never be edited or removed — not even with the service role.
-- (`on delete set null` on actor_user_id is an UPDATE fired by the FK; it is
-- allowed through because it only clears that one column.)
create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Checked as a separate statement: on DELETE, `new` is unassigned, and
  -- referencing it at all would raise. Do not fold this into the test below.
  if tg_op <> 'UPDATE' then
    raise exception 'The admin audit log is append-only.' using errcode = '42501';
  end if;

  if new.id = old.id
     and new.action = old.action
     and new.target_type is not distinct from old.target_type
     and new.target_id is not distinct from old.target_id
     and new.metadata = old.metadata
     and new.created_at = old.created_at
     and new.actor_user_id is null
     and old.actor_user_id is not null then
    return new;
  end if;
  raise exception 'The admin audit log is append-only.' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_log_no_change on public.admin_audit_log;
create trigger admin_audit_log_no_change
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

-- Internal writer used by the functions below. Not callable by sessions.
create or replace function public._admin_audit(
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_metadata    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_log (actor_user_id, actor_email, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    (select u.email from auth.users u where u.id = auth.uid()),
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public._admin_audit(text, text, text, jsonb) from public, anon, authenticated, service_role;

-- Public entry point for server code that needs to log an action which has no
-- dedicated function (e.g. "payroll CSV exported"). Super Admins only; the
-- action name is constrained to a known prefix so it cannot be used to forge
-- access-change entries.
create or replace function public.admin_log_action(
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  if p_action is null
     or p_action !~ '^(email|communication|payroll|export|view|note)\.[a-z_.]{1,60}$' then
    raise exception 'Invalid audit action.' using errcode = '22023';
  end if;

  -- The log cannot be pruned, so a single entry may not be used to bloat it.
  if length(coalesce(p_metadata, '{}'::jsonb)::text) > 4000 then
    raise exception 'Audit metadata is too large.' using errcode = '22023';
  end if;

  return public._admin_audit(p_action, p_target_type, left(p_target_id, 200), p_metadata);
end;
$$;

revoke all on function public.admin_log_action(text, text, text, jsonb) from public, anon;
grant execute on function public.admin_log_action(text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 3. GRANT / REVOKE SUPER ADMIN
--    Only the PRIMARY Super Admin manages access. Every change is locked,
--    validated and audited inside one transaction.
-- ============================================================================

create or replace function public.grant_super_admin(
  p_email text,
  p_note  text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_target  auth.users;
  v_name    text;
  v_role    text;
  v_existing public.super_admins;
  v_regrant boolean := false;
begin
  if v_caller is null or not public.is_primary_super_admin() then
    raise exception 'Only the primary Super Admin can grant access.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'Enter the email address of the operations account.' using errcode = '22023';
  end if;

  -- Serialise every access change.
  perform pg_advisory_xact_lock(hashtext('public.super_admins'));

  select * into v_target
    from auth.users u
   where lower(u.email) = lower(btrim(coalesce(p_email, '')))
   limit 1;

  if not found then
    raise exception 'No account exists with that email. Create the login first (Supabase → Authentication → Add user).'
      using errcode = 'P0002';
  end if;

  if v_target.id = v_caller then
    raise exception 'You cannot change your own access.' using errcode = '42501';
  end if;

  -- Super Admin accounts are kept separate from worker and retailer accounts.
  select p.role, p.full_name into v_role, v_name from public.profiles p where p.id = v_target.id;
  if v_role in ('worker', 'retailer')
     or exists (select 1 from public.workers w where w.auth_user_id = v_target.id)
     or exists (select 1 from public.store_users su where su.auth_user_id = v_target.id) then
    raise exception 'That email belongs to a worker or retailer account. Use a dedicated operations login for Super Admin access.'
      using errcode = 'P0001';
  end if;

  if v_target.email_confirmed_at is null then
    raise exception 'That account has not confirmed its email address yet.' using errcode = 'P0001';
  end if;

  select * into v_existing from public.super_admins where user_id = v_target.id for update;

  if found then
    if v_existing.status = 'active' then
      raise exception 'That account already has Super Admin access.' using errcode = 'P0001';
    end if;
    v_regrant := true;
  end if;

  insert into public.super_admins (user_id, email, full_name, is_primary, status, granted_by, granted_at, revoked_by, revoked_at, note, updated_at)
  values (v_target.id, v_target.email, coalesce(v_name, v_target.raw_user_meta_data->>'full_name'),
          false, 'active', v_caller, now(), null, null, nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (user_id) do update
     set status     = 'active',
         email      = excluded.email,
         full_name  = coalesce(excluded.full_name, public.super_admins.full_name),
         granted_by = excluded.granted_by,
         granted_at = excluded.granted_at,
         revoked_by = null,
         revoked_at = null,
         note       = excluded.note,
         updated_at = now();

  perform public._admin_audit(
    'access.super_admin_granted', 'user', v_target.id::text,
    jsonb_build_object('email', v_target.email, 'regrant', v_regrant)
  );

  return json_build_object('ok', true, 'user_id', v_target.id, 'email', v_target.email);
end;
$$;

create or replace function public.revoke_super_admin(
  p_user_id uuid,
  p_reason  text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.super_admins;
  v_active int;
begin
  if v_caller is null or not public.is_primary_super_admin() then
    raise exception 'Only the primary Super Admin can revoke access.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.super_admins'));

  if p_user_id = v_caller then
    raise exception 'You cannot revoke your own access.' using errcode = '42501';
  end if;

  select * into v_row from public.super_admins where user_id = p_user_id for update;
  if not found or v_row.status <> 'active' then
    raise exception 'That account does not have active Super Admin access.' using errcode = 'P0002';
  end if;

  if v_row.is_primary then
    raise exception 'The primary Super Admin cannot be revoked from the app.' using errcode = 'P0001';
  end if;

  select count(*) into v_active from public.super_admins where status = 'active';
  if v_active <= 1 then
    raise exception 'At least one Super Admin must remain.' using errcode = 'P0001';
  end if;

  update public.super_admins
     set status = 'revoked', revoked_by = v_caller, revoked_at = now(),
         note = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), note),
         updated_at = now()
   where user_id = p_user_id;

  perform public._admin_audit(
    'access.super_admin_revoked', 'user', p_user_id::text,
    jsonb_build_object('email', v_row.email, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return json_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

revoke all on function public.grant_super_admin(text, text) from public, anon;
revoke all on function public.revoke_super_admin(uuid, text) from public, anon;
grant execute on function public.grant_super_admin(text, text) to authenticated;
grant execute on function public.revoke_super_admin(uuid, text) to authenticated;

-- ============================================================================
-- 4. ADMIN COMMUNICATIONS — metadata only (the message body is not stored)
-- ============================================================================

create table if not exists public.admin_communications (
  id                   uuid primary key default gen_random_uuid(),
  admin_user_id        uuid references auth.users(id) on delete set null,
  channel              text not null default 'email',
  recipient_type       text not null,
  recipient_id         text,
  recipient_email      text,
  subject              text,
  status               text not null,
  provider             text,
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_communications_channel_check' and conrelid = 'public.admin_communications'::regclass) then
    alter table public.admin_communications add constraint admin_communications_channel_check
      check (channel in ('email'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_communications_recipient_type_check' and conrelid = 'public.admin_communications'::regclass) then
    alter table public.admin_communications add constraint admin_communications_recipient_type_check
      check (recipient_type in ('worker', 'retailer', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_communications_status_check' and conrelid = 'public.admin_communications'::regclass) then
    alter table public.admin_communications add constraint admin_communications_status_check
      check (status in ('sent', 'failed', 'not_configured', 'handed_to_mail_client'));
  end if;
end $$;

create index if not exists admin_communications_created_at_idx
  on public.admin_communications (created_at desc);
create index if not exists admin_communications_recipient_idx
  on public.admin_communications (recipient_type, recipient_id);

alter table public.admin_communications enable row level security;
revoke all on public.admin_communications from anon, authenticated;
grant select on public.admin_communications to authenticated;

drop policy if exists admin_communications_select_admins on public.admin_communications;
create policy admin_communications_select_admins on public.admin_communications
  for select to authenticated
  using (public.is_super_admin());

-- Records one communication attempt and its audit entry, atomically.
create or replace function public.admin_record_communication(
  p_recipient_type      text,
  p_recipient_id        text,
  p_recipient_email     text,
  p_subject             text,
  p_status              text,
  p_provider            text default null,
  p_provider_message_id text default null,
  p_error               text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  if p_status not in ('sent', 'failed', 'not_configured', 'handed_to_mail_client') then
    raise exception 'Unknown communication status.' using errcode = '22023';
  end if;

  if p_recipient_type not in ('worker', 'retailer', 'other') then
    raise exception 'Unknown recipient type.' using errcode = '22023';
  end if;

  insert into public.admin_communications (
    admin_user_id, channel, recipient_type, recipient_id, recipient_email,
    subject, status, provider, provider_message_id, error
  ) values (
    auth.uid(), 'email', p_recipient_type, left(p_recipient_id, 100), left(p_recipient_email, 320),
    left(p_subject, 300), p_status, left(p_provider, 60), left(p_provider_message_id, 200), left(p_error, 500)
  )
  returning id into v_id;

  perform public._admin_audit(
    'communication.email_' || p_status, p_recipient_type, p_recipient_id,
    jsonb_build_object('communication_id', v_id, 'recipient_email', p_recipient_email,
                       'subject', left(p_subject, 300), 'provider', p_provider)
  );

  return v_id;
end;
$$;

revoke all on function public.admin_record_communication(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_record_communication(text, text, text, text, text, text, text, text) to authenticated;

-- ============================================================================
-- 5. WORKED HOURS + PAYROLL STATE — one row per hired shift
--
--    Scheduled hours (shifts.duration) are NEVER copied in here as payroll
--    time. A row exists only once someone has actually recorded the hours
--    worked, and only `approved_hours` with approval_status = 'approved' is
--    payroll-ready.
--
--    actual_start_time / actual_end_time are `timestamp` (no time zone) to
--    match shifts.start_time / end_time: wall-clock times at the store.
-- ============================================================================

-- `on delete cascade` on both FKs matches every other table in this schema
-- (notifications, reviews, shift_payments). A RESTRICT here would turn deleting
-- an auth user into an error, because that cascades to their `workers` row. The
-- durable record of what was approved is the audit log, which has no FK to
-- workers and therefore survives.
create table if not exists public.shift_time_entries (
  id                     uuid primary key default gen_random_uuid(),
  shift_id               uuid not null references public.shifts(id) on delete cascade,
  worker_id              uuid not null references public.workers(id) on delete cascade,
  actual_start_time      timestamp,
  actual_end_time        timestamp,
  break_minutes          integer not null default 0,
  reported_hours         numeric(6,2),
  hours_source           text not null default 'admin',
  submitted_by           uuid references auth.users(id) on delete set null,
  submitted_at           timestamptz,
  submission_note        text,
  approval_status        text not null default 'submitted',
  approved_hours         numeric(6,2),
  approved_by            uuid references auth.users(id) on delete set null,
  approved_at            timestamptz,
  approval_note          text,
  worker_hourly_rate     numeric(8,2) not null default 20,
  payroll_status         text not null default 'not_ready',
  payroll_provider       text,
  payroll_batch_id       text,
  payroll_exported_at    timestamptz,
  payroll_submitted_at   timestamptz,
  payroll_processed_at   timestamptz,
  payroll_external_ref   text,
  payroll_error          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_source_check' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_source_check
      check (hours_source in ('retailer', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_approval_check' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_approval_check
      check (approval_status in ('submitted', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_payroll_check' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_payroll_check
      check (payroll_status in ('not_ready', 'ready', 'exported', 'submitted', 'processed', 'error'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_hours_range' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_hours_range
      check ((reported_hours is null or (reported_hours > 0 and reported_hours <= 24))
         and (approved_hours is null or (approved_hours > 0 and approved_hours <= 24)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_break_range' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_break_range
      check (break_minutes between 0 and 720);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_times_order' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_times_order
      check (actual_start_time is null or actual_end_time is null or actual_end_time > actual_start_time);
  end if;
  -- Payroll-ready requires an approval.
  if not exists (select 1 from pg_constraint where conname = 'shift_time_entries_ready_needs_approval' and conrelid = 'public.shift_time_entries'::regclass) then
    alter table public.shift_time_entries add constraint shift_time_entries_ready_needs_approval
      check (payroll_status = 'not_ready'
             or (approval_status = 'approved' and approved_hours is not null and approved_at is not null));
  end if;
end $$;

create unique index if not exists shift_time_entries_shift_key on public.shift_time_entries (shift_id);
create index if not exists shift_time_entries_worker_idx on public.shift_time_entries (worker_id);
create index if not exists shift_time_entries_payroll_idx on public.shift_time_entries (payroll_status);

alter table public.shift_time_entries enable row level security;
revoke all on public.shift_time_entries from anon, authenticated;

-- The store and the worker may see the hours themselves and whether they were
-- approved. The rate, the free-text notes and the payroll plumbing are not
-- granted to any session — the console reads those server-side. (Same technique
-- as workers.phone / stores.contact_phone in migration 0001.)
grant select (id, shift_id, worker_id, actual_start_time, actual_end_time,
              break_minutes, reported_hours, hours_source, submitted_at,
              approval_status, approved_hours, approved_at, created_at, updated_at)
  on public.shift_time_entries to authenticated;

-- Readable by Super Admins, the store that ran the shift, and the hired
-- worker. No write policy: writes only through the functions below.
drop policy if exists shift_time_entries_select on public.shift_time_entries;
create policy shift_time_entries_select on public.shift_time_entries
  for select to authenticated
  using (
    public.is_super_admin()
    or public.is_shift_store_member(shift_id)
    or worker_id = public.current_worker_id()
  );

-- Shift start/end are wall-clock times at the store, so comparing them with
-- now() has to happen in the store's zone: `start_time::timestamptz` would
-- read them as UTC and be hours out. Mirrors OPERATIONS_TIME_ZONE in
-- lib/admin/config.ts — change both together.
create or replace function public.operations_time_zone()
returns text language sql immutable set search_path = '' as $$
  select 'America/Los_Angeles'::text;
$$;

-- "Now", as a wall clock at the store.
create or replace function public.operations_now()
returns timestamp language sql stable set search_path = '' as $$
  select (now() at time zone public.operations_time_zone())::timestamp;
$$;

create or replace function public.worker_gross_hourly_rate()
returns numeric language sql immutable set search_path = '' as $$
  select 20::numeric;
$$;

comment on function public.worker_gross_hourly_rate() is
  'Worker gross hourly rate. Mirrors WORKER_HOURLY_RATE in lib/pricing.ts.';

-- Record the hours actually worked on a hired shift.
-- Callable by the shift's store (source = retailer) or a Super Admin
-- (source = admin). Always lands as 'submitted' — never as payroll time.
create or replace function public.submit_shift_hours(
  p_shift_id      uuid,
  p_actual_start  timestamp,
  p_actual_end    timestamp,
  p_break_minutes integer default 0,
  p_note          text default null
)
returns public.shift_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_admin boolean := public.is_super_admin();
  v_is_store boolean := public.is_shift_store_member(p_shift_id);
  v_shift    public.shifts;
  v_hours    numeric;
  v_break    integer := coalesce(p_break_minutes, 0);
  v_entry    public.shift_time_entries;
  v_previous_hours numeric;
begin
  if v_uid is null or not (v_is_admin or v_is_store) then
    raise exception 'Not authorised to record hours for this shift.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;
  if v_shift.accepted_by is null then
    raise exception 'Nobody was hired for this shift.' using errcode = 'P0001';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'A cancelled shift has no hours to record.' using errcode = 'P0001';
  end if;
  if v_shift.start_time > public.operations_now() then
    raise exception 'This shift has not started yet.' using errcode = 'P0001';
  end if;

  if p_actual_start is null or p_actual_end is null or p_actual_end <= p_actual_start then
    raise exception 'Enter a valid actual start and end time.' using errcode = '22023';
  end if;
  if v_break < 0 or v_break > 720 then
    raise exception 'Break minutes must be between 0 and 720.' using errcode = '22023';
  end if;

  v_hours := round(((extract(epoch from (p_actual_end - p_actual_start)) / 60.0 - v_break) / 60.0)::numeric, 2);
  if v_hours <= 0 or v_hours > 24 then
    raise exception 'Worked hours must be more than 0 and at most 24.' using errcode = '22023';
  end if;

  -- Everything that depends on there already being an entry is decided inside
  -- this one block, so nothing later has to rely on FOUND still being set.
  select * into v_entry from public.shift_time_entries where shift_id = p_shift_id for update;

  if found then
    v_previous_hours := v_entry.reported_hours;

    if v_entry.payroll_status in ('exported', 'submitted', 'processed') then
      raise exception 'These hours have already gone to payroll and cannot be changed here.' using errcode = 'P0001';
    end if;

    -- Approved hours are operations' record. A store cannot quietly replace
    -- them (which would reset the approval); it has to go through operations.
    if v_entry.approval_status = 'approved' and not v_is_admin then
      raise exception 'These hours have already been approved for payroll. Contact ShiftSupport operations to change them.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.shift_time_entries (
    shift_id, worker_id, actual_start_time, actual_end_time, break_minutes,
    reported_hours, hours_source, submitted_by, submitted_at, submission_note,
    approval_status, approved_hours, approved_by, approved_at, approval_note,
    worker_hourly_rate, payroll_status, updated_at
  ) values (
    p_shift_id, v_shift.accepted_by, p_actual_start, p_actual_end, v_break,
    v_hours, case when v_is_store and not v_is_admin then 'retailer' else 'admin' end,
    v_uid, now(), nullif(btrim(coalesce(p_note, '')), ''),
    'submitted', null, null, null, null,
    public.worker_gross_hourly_rate(), 'not_ready', now()
  )
  on conflict (shift_id) do update
     set worker_id         = excluded.worker_id,
         actual_start_time = excluded.actual_start_time,
         actual_end_time   = excluded.actual_end_time,
         break_minutes     = excluded.break_minutes,
         reported_hours    = excluded.reported_hours,
         hours_source      = excluded.hours_source,
         submitted_by      = excluded.submitted_by,
         submitted_at      = excluded.submitted_at,
         submission_note   = excluded.submission_note,
         -- New hours always need a fresh approval.
         approval_status   = 'submitted',
         approved_hours    = null,
         approved_by       = null,
         approved_at       = null,
         approval_note     = null,
         payroll_status    = 'not_ready',
         payroll_error     = null,
         updated_at        = now()
  returning * into v_entry;

  -- Logged whoever recorded them: a store replacing previously recorded hours
  -- is exactly the kind of change operations needs to be able to see.
  perform public._admin_audit(
    'payroll.hours_recorded', 'shift', p_shift_id::text,
    jsonb_build_object('reported_hours', v_hours, 'break_minutes', v_break,
                       'actual_start', p_actual_start, 'actual_end', p_actual_end,
                       'scheduled_hours', v_shift.duration,
                       'source', case when v_is_admin then 'admin' else 'retailer' end,
                       'replaced_previous', v_previous_hours is not null,
                       'previous_hours', v_previous_hours)
  );

  return v_entry;
end;
$$;

-- Approve (optionally adjusting) or reject recorded hours. Super Admin only.
-- Requires the shift to be marked completed by the store.
create or replace function public.review_shift_hours(
  p_shift_id       uuid,
  p_decision       text,
  p_approved_hours numeric default null,
  p_note           text default null
)
returns public.shift_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_shift public.shifts;
  v_entry public.shift_time_entries;
  v_hours numeric;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can review hours.' using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  select * into v_entry from public.shift_time_entries where shift_id = p_shift_id for update;
  if not found then
    raise exception 'No hours have been recorded for this shift yet.' using errcode = 'P0002';
  end if;

  if v_entry.payroll_status in ('exported', 'submitted', 'processed') then
    raise exception 'These hours have already gone to payroll and cannot be changed here.' using errcode = 'P0001';
  end if;

  if p_decision = 'reject' then
    update public.shift_time_entries
       set approval_status = 'rejected', approved_hours = null, approved_by = v_uid,
           approved_at = null, approval_note = nullif(btrim(coalesce(p_note, '')), ''),
           payroll_status = 'not_ready', updated_at = now()
     where id = v_entry.id
     returning * into v_entry;

    perform public._admin_audit('payroll.hours_rejected', 'shift', p_shift_id::text,
      jsonb_build_object('reported_hours', v_entry.reported_hours, 'note', v_entry.approval_note));
    return v_entry;
  end if;

  if v_shift.status <> 'completed' then
    raise exception 'The store has not marked this shift completed yet.' using errcode = 'P0001';
  end if;

  -- The hired worker can be changed on the shift after hours were recorded;
  -- approving would then pay the wrong person.
  if v_shift.accepted_by is distinct from v_entry.worker_id then
    raise exception 'The hired worker has changed since these hours were recorded. Re-record them before approving.'
      using errcode = 'P0001';
  end if;

  v_hours := round(coalesce(p_approved_hours, v_entry.reported_hours)::numeric, 2);
  if v_hours is null or v_hours <= 0 or v_hours > 24 then
    raise exception 'Approved hours must be more than 0 and at most 24.' using errcode = '22023';
  end if;

  update public.shift_time_entries
     set approval_status = 'approved', approved_hours = v_hours, approved_by = v_uid,
         approved_at = now(), approval_note = nullif(btrim(coalesce(p_note, '')), ''),
         payroll_status = 'ready', payroll_error = null, updated_at = now()
   where id = v_entry.id
   returning * into v_entry;

  perform public._admin_audit('payroll.hours_approved', 'shift', p_shift_id::text,
    jsonb_build_object('approved_hours', v_hours, 'reported_hours', v_entry.reported_hours,
                       'scheduled_hours', v_shift.duration,
                       'adjusted', v_hours is distinct from v_entry.reported_hours,
                       'note', v_entry.approval_note));
  return v_entry;
end;
$$;

-- Moves approved entries along the payroll pipeline. Only forward moves are
-- allowed, except 'error' -> 'ready' (retry) and 'exported' -> 'ready'
-- (an export that was never actually uploaded).
create or replace function public.set_payroll_status(
  p_shift_ids    uuid[],
  p_status       text,
  p_provider     text default null,
  p_batch_id     text default null,
  p_external_ref text default null,
  p_error        text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can change payroll status.' using errcode = '42501';
  end if;

  if p_status not in ('ready', 'exported', 'submitted', 'processed', 'error') then
    raise exception 'Unknown payroll status.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_shift_ids, 1), 0) = 0 or array_length(p_shift_ids, 1) > 1000 then
    raise exception 'Choose between 1 and 1000 shifts.' using errcode = '22023';
  end if;

  update public.shift_time_entries e
     set payroll_status       = p_status,
         payroll_provider     = coalesce(left(p_provider, 60), e.payroll_provider),
         payroll_batch_id     = coalesce(left(p_batch_id, 100), e.payroll_batch_id),
         payroll_external_ref = coalesce(left(p_external_ref, 200), e.payroll_external_ref),
         payroll_error        = case when p_status = 'error' then left(p_error, 500) else null end,
         payroll_exported_at  = case when p_status = 'exported' then now() else e.payroll_exported_at end,
         payroll_submitted_at = case when p_status = 'submitted' then now() else e.payroll_submitted_at end,
         payroll_processed_at = case when p_status = 'processed' then now() else e.payroll_processed_at end,
         updated_at           = now()
   where e.shift_id = any(p_shift_ids)
     and e.approval_status = 'approved'
     and (
          (p_status = 'exported'  and e.payroll_status in ('ready', 'exported', 'error'))
       or (p_status = 'submitted' and e.payroll_status in ('ready', 'exported', 'error'))
       or (p_status = 'processed' and e.payroll_status in ('exported', 'submitted'))
       or (p_status = 'error'     and e.payroll_status in ('ready', 'exported', 'submitted', 'processed'))
       or (p_status = 'ready'     and e.payroll_status in ('exported', 'error'))
     );

  get diagnostics v_count = row_count;

  perform public._admin_audit('payroll.status_' || p_status, 'shift_batch', left(p_batch_id, 200),
    jsonb_build_object('requested', array_length(p_shift_ids, 1), 'updated', v_count,
                       'provider', p_provider, 'shift_ids', to_jsonb(p_shift_ids)));

  return v_count;
end;
$$;

revoke all on function public.operations_time_zone() from public, anon;
revoke all on function public.operations_now() from public, anon;
revoke all on function public.worker_gross_hourly_rate() from public, anon;
revoke all on function public.submit_shift_hours(uuid, timestamp, timestamp, integer, text) from public, anon;
revoke all on function public.review_shift_hours(uuid, text, numeric, text) from public, anon;
revoke all on function public.set_payroll_status(uuid[], text, text, text, text, text) from public, anon;
grant execute on function public.operations_time_zone() to authenticated;
grant execute on function public.operations_now() to authenticated;
grant execute on function public.worker_gross_hourly_rate() to authenticated;
grant execute on function public.submit_shift_hours(uuid, timestamp, timestamp, integer, text) to authenticated;
grant execute on function public.review_shift_hours(uuid, text, numeric, text) to authenticated;
grant execute on function public.set_payroll_status(uuid[], text, text, text, text, text) to authenticated;

-- ============================================================================
-- 6. PAYROLL IDENTITY — maps a worker to their payroll-provider employee id
--    Empty until the client confirms how ADP identifies employees. No bank or
--    tax information is ever stored here; ADP holds that.
-- ============================================================================

create table if not exists public.worker_payroll_identities (
  worker_id             uuid not null references public.workers(id) on delete cascade,
  provider              text not null default 'adp',
  external_employee_id  text not null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (worker_id, provider)
);

alter table public.worker_payroll_identities enable row level security;
revoke all on public.worker_payroll_identities from anon, authenticated;
grant select on public.worker_payroll_identities to authenticated;

drop policy if exists worker_payroll_identities_select_admins on public.worker_payroll_identities;
create policy worker_payroll_identities_select_admins on public.worker_payroll_identities
  for select to authenticated
  using (public.is_super_admin());

create or replace function public.set_worker_payroll_identity(
  p_worker_id            uuid,
  p_external_employee_id text,
  p_provider             text default 'adp'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := nullif(btrim(coalesce(p_external_employee_id, '')), '');
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if p_provider is null or p_provider !~ '^[a-z_]{2,30}$' then
    raise exception 'Invalid payroll provider.' using errcode = '22023';
  end if;
  if v_ref is not null and v_ref !~ '^[A-Za-z0-9._-]{1,64}$' then
    raise exception 'Employee id may only contain letters, digits, dot, dash and underscore.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workers where id = p_worker_id) then
    raise exception 'Worker not found.' using errcode = 'P0002';
  end if;

  if v_ref is null then
    delete from public.worker_payroll_identities where worker_id = p_worker_id and provider = p_provider;
  else
    insert into public.worker_payroll_identities (worker_id, provider, external_employee_id, updated_by, updated_at)
    values (p_worker_id, p_provider, v_ref, auth.uid(), now())
    on conflict (worker_id, provider) do update
       set external_employee_id = excluded.external_employee_id,
           updated_by = excluded.updated_by, updated_at = now();
  end if;

  perform public._admin_audit('payroll.employee_id_set', 'worker', p_worker_id::text,
    jsonb_build_object('provider', p_provider, 'cleared', v_ref is null));
end;
$$;

revoke all on function public.set_worker_payroll_identity(uuid, text, text) from public, anon;
grant execute on function public.set_worker_payroll_identity(uuid, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 7. VERIFY
-- ============================================================================

select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('super_admins', 'admin_audit_log', 'admin_communications',
                     'shift_time_entries', 'worker_payroll_identities')
 order by tablename;

-- ============================================================================
-- 8. (nothing) — existing tables, policies and triggers are untouched.
-- ============================================================================

-- ============================================================================
-- 9. BOOTSTRAP THE PRIMARY SUPER ADMIN — run ONCE, by hand, after the above.
--
--    !! SUPERSEDED BY MIGRATION 0011. The guard below reads `profiles.role`,
--    but a trigger on auth.users gives every new auth user a profiles row with
--    role 'worker' — so this SELECT matches zero rows for a fresh operations
--    account and the INSERT silently inserts nothing. Use the corrected block
--    in `0011_super_admin_account_separation_fix.sql` instead.
--
--    1. Supabase Dashboard -> Authentication -> Users -> "Add user".
--       Use a DEDICATED operations email (not a worker or retailer login),
--       set a strong password, tick "Auto confirm user".
--    2. Replace the email below and run this block on its own.
--
--    This is the ONLY way the first Super Admin is created. After that, the
--    primary Super Admin grants/revokes others from /super-admin/admins.
-- ============================================================================
--
-- insert into public.super_admins (user_id, email, full_name, is_primary, status, granted_at, note)
-- select u.id, u.email, u.raw_user_meta_data->>'full_name', true, 'active', now(), 'Bootstrap (SQL editor)'
--   from auth.users u
--  where lower(u.email) = lower('ops@example.com')
--    and not exists (select 1 from public.profiles p where p.id = u.id and p.role in ('worker', 'retailer'))
-- on conflict (user_id) do update set status = 'active', is_primary = true, revoked_at = null, revoked_by = null, updated_at = now();
--
-- insert into public.admin_audit_log (actor_user_id, actor_email, action, target_type, target_id, metadata)
-- select null, 'sql-editor', 'access.primary_bootstrapped', 'user', u.id::text, jsonb_build_object('email', u.email)
--   from auth.users u where lower(u.email) = lower('ops@example.com');
