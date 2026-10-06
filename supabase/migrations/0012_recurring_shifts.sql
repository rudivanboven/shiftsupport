-- ============================================================================
--  ShiftSupport — Migration 0012
--  Recurring shifts: a series ("every Wednesday 17:00–20:00") whose dates are
--  ordinary shifts, and which keeps the worker the retailer hired.
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. One new table, two new NULLABLE columns on `shifts`, new
--      triggers and helper functions, and new policies on the new table only.
--      No table, column, row or existing policy is dropped or rewritten.
--    * Every existing shift has `series_id = NULL` and therefore stays exactly
--      what it is today: a one-time shift.
--    * Payments are untouched. Each date in a series is an ordinary `shifts`
--      row, priced, paid for and published through the existing per-shift
--      Stripe Checkout flow (one `shift_payments` row per shift, as before).
--      There is no subscription and nothing is charged automatically.
--    * One existing function is replaced: `hire_applicant` (migration 0002).
--      Its behaviour for a one-time shift is identical, statement for
--      statement; the only addition is the recurring-series block, which runs
--      solely when the shift belongs to a series.
--    * Idempotent: safe to re-run.
--
--  Run AFTER 0001–0011, in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

-- ============================================================================
-- 1. SHIFT_SERIES — the recurring "parent"
--
--    The series holds the schedule and the worker kept for it. It holds no
--    money: the hourly rate and the payment state live on each date (shift
--    row), exactly as they do for a one-time shift, so the existing rate and
--    payment triggers keep guarding them.
-- ============================================================================

create table if not exists public.shift_series (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores(id) on delete cascade,
  task_type          text not null,
  description        text,
  shift_location     text,
  -- ISO weekdays, 1 = Monday … 7 = Sunday (Postgres `extract(isodow …)`).
  days_of_week       smallint[] not null,
  -- Wall-clock times at the store, like shifts.start_time / end_time.
  start_time         time not null,
  end_time           time not null,
  starts_on          date not null,
  ends_on            date,
  status             text not null default 'active',
  -- The worker kept on every date of the series. Set only by hire_applicant.
  assigned_worker_id uuid references public.workers(id) on delete set null,
  assigned_at        timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.shift_series drop constraint if exists shift_series_status_check;
alter table public.shift_series
  add constraint shift_series_status_check
  check (status in ('active', 'ended', 'cancelled'));

alter table public.shift_series drop constraint if exists shift_series_days_check;
alter table public.shift_series
  add constraint shift_series_days_check
  check (
    cardinality(days_of_week) between 1 and 7
    and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

alter table public.shift_series drop constraint if exists shift_series_dates_check;
alter table public.shift_series
  add constraint shift_series_dates_check
  check (ends_on is null or ends_on >= starts_on);

create index if not exists shift_series_store_id_idx
  on public.shift_series (store_id);
create index if not exists shift_series_assigned_worker_idx
  on public.shift_series (assigned_worker_id) where assigned_worker_id is not null;

-- ============================================================================
-- 2. SHIFTS — which series a date belongs to
--
--    Both columns are nullable; NULL means a one-time shift. A date keeps its
--    own row, id, status, payment and hired worker, so one date can later be
--    cancelled, changed or reopened without touching the rest of the series.
-- ============================================================================

alter table public.shifts
  add column if not exists series_id       uuid references public.shift_series(id) on delete set null,
  add column if not exists occurrence_date date;

alter table public.shifts drop constraint if exists shifts_series_occurrence_check;
alter table public.shifts
  add constraint shifts_series_occurrence_check
  check (series_id is null or occurrence_date is not null);

-- One row per date per series.
create unique index if not exists shifts_series_occurrence_key
  on public.shifts (series_id, occurrence_date) where series_id is not null;

create index if not exists shifts_series_id_idx
  on public.shifts (series_id) where series_id is not null;

-- ============================================================================
-- 3. A SHIFT CAN ONLY JOIN ITS OWN STORE'S SERIES
--
--    A retailer can write their own shifts (shifts_insert_own_store /
--    shifts_update_own_store). Without this, a hand-rolled request could attach
--    a shift to another store's series and so inherit that store's worker.
-- ============================================================================

create or replace function public.enforce_shift_series_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.shift_series ss
     where ss.id = new.series_id
       and ss.store_id = new.store_id
  ) then
    raise exception 'This shift cannot be added to that recurring series.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_series_guard on public.shifts;
create trigger shifts_series_guard
  before insert or update of series_id, store_id on public.shifts
  for each row execute function public.enforce_shift_series_store();

-- ============================================================================
-- 4. THE KEPT WORKER IS NOT WRITABLE FROM A BROWSER
--
--    A retailer may create and update their own series (RLS, §7), but must not
--    be able to name a worker directly: that would put a worker on dates they
--    never applied for. `assigned_worker_id` is set only by hire_applicant,
--    which runs as the function owner.
--
--    `current_user` is 'authenticated' / 'anon' for PostgREST requests, and the
--    owner inside a SECURITY DEFINER function — which is exactly the split
--    wanted here. (`auth.role()` cannot be used: it still reads
--    'authenticated' inside hire_applicant.)
-- ============================================================================

create or replace function public.enforce_shift_series_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.assigned_worker_id := null;
    new.assigned_at        := null;
  else
    new.assigned_worker_id := old.assigned_worker_id;
    new.assigned_at        := old.assigned_at;
    new.store_id           := old.store_id;
  end if;

  return new;
end;
$$;

drop trigger if exists shift_series_enforce_assignment on public.shift_series;
create trigger shift_series_enforce_assignment
  before insert or update on public.shift_series
  for each row execute function public.enforce_shift_series_assignment();

-- ============================================================================
-- 5. A DATE PUBLISHED AFTER THE HIRE KEEPS THE SAME WORKER
--
--    Each date is paid for separately. When a later date's payment publishes
--    it (draft -> open, written by the existing Stripe fulfillment), this
--    trigger fills it with the series' worker instead of sending it to the
--    marketplace. The fulfillment code is unchanged: it still writes
--    status 'open' + payment 'paid'; for a date with a kept worker the row
--    lands as 'filled'. The payment columns are not touched here.
--
--    Only the publish transition (draft -> open) is affected. A date that is
--    later cancelled and reopened goes to the marketplace like any shift, so a
--    single date can be handed to somebody else without changing the series.
--
--    The kept worker must still hold an active membership — the same rule the
--    application INSERT policy applies — otherwise the date simply publishes
--    to the marketplace as normal.
--
--    Fires after shifts_enforce_payment_state (triggers run in name order), so
--    it sees the payment columns as that trigger left them.
-- ============================================================================

create or replace function public.assign_series_worker_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id  uuid;
  v_auth_id    uuid;
  v_store_name text;
begin
  if not (
    old.status = 'draft'
    and new.status = 'open'
    and new.series_id is not null
    and new.accepted_by is null
    and new.payment_status in ('paid', 'legacy')
  ) then
    return new;
  end if;

  select w.id, w.auth_user_id
    into v_worker_id, v_auth_id
    from public.shift_series ss
    join public.workers w on w.id = ss.assigned_worker_id
   where ss.id = new.series_id
     and ss.status = 'active'
     and public.membership_grants_access(w.membership_status, w.membership_expires_at);

  if v_worker_id is null then
    return new;
  end if;

  new.accepted_by := v_worker_id;
  new.status      := 'filled';

  insert into public.shift_accepts (shift_id, worker_id, accepted_at)
  values (new.id, v_worker_id, now())
  on conflict do nothing;

  if v_auth_id is not null then
    select name into v_store_name from public.stores where id = new.store_id;
    insert into public.notifications (user_id, type, title, body, shift_id)
    values (
      v_auth_id,
      'series_scheduled',
      'New date in your recurring shift',
      format('%s added %s to your recurring %s shift. You''re booked for it.',
             coalesce(v_store_name, 'The store'),
             to_char(new.start_time, 'FMDay DD Mon'),
             new.task_type),
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_series_auto_assign on public.shifts;
create trigger shifts_series_auto_assign
  before update on public.shifts
  for each row execute function public.assign_series_worker_on_publish();

-- ============================================================================
-- 6. HIRE_APPLICANT — unchanged for one-time shifts, plus the series block
--
--    Identical to migration 0002 up to the final notifications. When the shift
--    is a date in a series that has no kept worker yet, the hired worker
--    becomes the series' worker and is put on every LATER date of the series
--    that is already live and unfilled — in the same transaction, so there is
--    one application, not one per week. Pending applicants on those dates are
--    declined and told why, exactly as the hire itself declines them.
--
--    Hiring somebody for a single date when the series already has a worker
--    (e.g. covering one week) fills that date only; the series keeps its
--    worker.
--
--    Lock order: the series row is locked BEFORE the shift row. Two hires on
--    different dates of the same series therefore serialise on the series
--    instead of deadlocking on each other's shift rows. One-time shifts take
--    no extra lock.
-- ============================================================================

create or replace function public.hire_applicant(p_application_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app        public.shift_applications;
  v_shift      public.shifts;
  v_store_name text;
  v_worker     public.workers;
  v_series_id  uuid;
  v_kept       int := 0;
  v_kept_ids   uuid[] := '{}';
begin
  select * into v_app from public.shift_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;

  -- Recurring dates only: take the series lock first (see lock order above).
  select series_id into v_series_id from public.shifts where id = v_app.shift_id;
  if v_series_id is not null then
    perform 1 from public.shift_series where id = v_series_id for update;
  end if;

  -- Serialise every hire attempt for this shift.
  select * into v_shift from public.shifts where id = v_app.shift_id for update;
  if not found then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You are not authorised to hire for this shift.' using errcode = '42501';
  end if;

  if v_shift.accepted_by is not null then
    raise exception 'This shift has already been filled.' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'open' then
    raise exception 'This shift is no longer open.' using errcode = 'P0001';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'This application has already been reviewed.' using errcode = 'P0001';
  end if;

  select name into v_store_name from public.stores where id = v_shift.store_id;
  select * into v_worker from public.workers where id = v_app.worker_id;

  update public.shifts
     set accepted_by = v_app.worker_id,
         status      = 'filled',
         updated_at  = now()
   where id = v_shift.id;

  update public.shift_applications
     set status = 'approved', reviewed_at = now(), rejection_reason = null
   where id = v_app.id;

  insert into public.shift_accepts (shift_id, worker_id, accepted_at)
  values (v_shift.id, v_app.worker_id, now())
  on conflict do nothing;

  -- Everyone else on this shift is auto-declined, and told why.
  with declined as (
    update public.shift_applications
       set status           = 'rejected',
           reviewed_at      = now(),
           rejection_reason = coalesce(rejection_reason, 'Another applicant was hired for this shift.')
     where shift_id = v_shift.id
       and id <> v_app.id
       and status = 'pending'
    returning worker_id
  )
  insert into public.notifications (user_id, type, title, body, shift_id)
  select w.auth_user_id,
         'not_selected',
         'Application update',
         format('You were not selected for the %s shift at %s.', v_shift.task_type, v_store_name),
         v_shift.id
    from declined d
    join public.workers w on w.id = d.worker_id
   where w.auth_user_id is not null;

  if v_worker.auth_user_id is not null then
    insert into public.notifications (user_id, type, title, body, shift_id)
    values (
      v_worker.auth_user_id,
      'hired',
      'You''re hired!',
      format('%s hired you for the %s shift. Store contact details are now available.',
             v_store_name, v_shift.task_type),
      v_shift.id
    );
  end if;

  -- ---------------------------------------------------------------------
  -- Recurring series: keep this worker for the series' later dates.
  -- ---------------------------------------------------------------------
  if v_shift.series_id is not null then
    update public.shift_series
       set assigned_worker_id = v_app.worker_id,
           assigned_at        = now(),
           updated_at         = now()
     where id = v_shift.series_id
       and assigned_worker_id is null
       and status = 'active';

    if found then
      with kept as (
        update public.shifts
           set accepted_by = v_app.worker_id,
               status      = 'filled',
               updated_at  = now()
         where series_id = v_shift.series_id
           and id <> v_shift.id
           and occurrence_date > v_shift.occurrence_date
           and status = 'open'
           and accepted_by is null
           and payment_status in ('paid', 'legacy')
        returning id
      )
      select coalesce(array_agg(id), '{}') into v_kept_ids from kept;

      v_kept := cardinality(v_kept_ids);

      insert into public.shift_accepts (shift_id, worker_id, accepted_at)
      select k, v_app.worker_id, now() from unnest(v_kept_ids) as k
      on conflict do nothing;

      -- The kept dates' own pending applicants are declined, and told why.
      with declined as (
        update public.shift_applications
           set status           = 'rejected',
               reviewed_at      = now(),
               rejection_reason = coalesce(rejection_reason,
                                           'The store booked its recurring worker for this date.')
         where shift_id = any (v_kept_ids)
           and status = 'pending'
        returning worker_id, shift_id
      )
      insert into public.notifications (user_id, type, title, body, shift_id)
      select w.auth_user_id,
             'not_selected',
             'Application update',
             format('You were not selected for the %s shift at %s.', v_shift.task_type, v_store_name),
             d.shift_id
        from declined d
        join public.workers w on w.id = d.worker_id
       where w.auth_user_id is not null;

      if v_worker.auth_user_id is not null then
        insert into public.notifications (user_id, type, title, body, shift_id)
        values (
          v_worker.auth_user_id,
          'series_assigned',
          'You''re the recurring worker',
          case
            when v_kept > 0 then
              format('%s kept you on for their recurring %s shift — you''re booked for %s more upcoming date%s, and new dates will be added for you automatically.',
                     v_store_name, v_shift.task_type, v_kept, case when v_kept = 1 then '' else 's' end)
            else
              format('%s kept you on for their recurring %s shift. New dates will be added for you automatically.',
                     v_store_name, v_shift.task_type)
          end,
          v_shift.id
        );
      end if;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'shift_id', v_shift.id,
    'application_id', v_app.id,
    'worker_id', v_app.worker_id,
    'worker_name', v_worker.full_name,
    'store_name', v_store_name,
    'series_kept_dates', v_kept
  );
end;
$$;

revoke execute on function public.hire_applicant(uuid) from public, anon;
grant  execute on function public.hire_applicant(uuid) to authenticated;

-- ============================================================================
-- 7. RLS — same standard as `shifts`
--
--    Store members manage their own series. A worker can read a series only
--    while they can see one of its dates (it is open and paid, they applied,
--    or they were hired) or they are its kept worker — the same rule
--    `shifts_select` applies to the dates themselves.
--    No DELETE policy: a series is ended or cancelled, never deleted.
-- ============================================================================

create or replace function public.worker_can_view_series(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.shifts s
     where s.series_id = p_series_id
       and (
         (s.accepted_by is not null and s.accepted_by = public.current_worker_id())
         or public.worker_has_applied_to_shift(s.id)
         or (
           s.status = 'open'
           and s.accepted_by is null
           and s.payment_status in ('paid', 'legacy')
         )
       )
  );
$$;

revoke all on function public.worker_can_view_series(uuid) from public, anon;
grant execute on function public.worker_can_view_series(uuid) to authenticated;

revoke all on function public.enforce_shift_series_store() from public, anon, authenticated;
revoke all on function public.enforce_shift_series_assignment() from public, anon, authenticated;
revoke all on function public.assign_series_worker_on_publish() from public, anon, authenticated;

alter table public.shift_series enable row level security;

drop policy if exists shift_series_select on public.shift_series;
create policy shift_series_select on public.shift_series
  for select to authenticated
  using (
    public.is_store_member(store_id)
    or (assigned_worker_id is not null and assigned_worker_id = public.current_worker_id())
    or public.worker_can_view_series(id)
  );

drop policy if exists shift_series_insert_own_store on public.shift_series;
create policy shift_series_insert_own_store on public.shift_series
  for insert to authenticated
  with check (public.is_store_member(store_id));

drop policy if exists shift_series_update_own_store on public.shift_series;
create policy shift_series_update_own_store on public.shift_series
  for update to authenticated
  using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));

revoke all on public.shift_series from anon;
grant select, insert, update on public.shift_series to authenticated;

commit;

-- Tell PostgREST to pick up the new table/columns immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- 8. VERIFY — expect the new columns, the four shifts triggers, and the
--    three shift_series policies.
-- ============================================================================

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'shifts'
   and column_name in ('series_id', 'occurrence_date');

select tgname
  from pg_trigger
 where tgrelid = 'public.shifts'::regclass
   and not tgisinternal
 order by tgname;

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'shift_series'
 order by policyname;
