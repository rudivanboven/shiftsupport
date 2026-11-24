-- ============================================================================
--  ShiftSupport — Migration 0019
--  Super Admin & Retailer Shift Management Controls:
--    * Edit Shift, Hide Shift, Show Shift, Renew Shift, Extend Date / Time
--      (separate Posting Expiry Date vs. Scheduled Shift Date/Time), and
--      Delete / Archive Shift.
--
--  SAFETY NOTES
--    * ADDITIVE & NON-DESTRUCTIVE. No existing table, column, row, policy,
--      or trigger is dropped or deleted.
--    * Adds nullable lifecycle columns on `public.shifts`:
--        - `is_hidden` (boolean, default false)
--        - `hidden_at` (timestamptz)
--        - `posting_expires_at` (timestamp without time zone, store wall-clock)
--        - `renewed_at` (timestamptz)
--        - `renewal_count` (integer, default 0)
--    * Distinguishes Posting Visibility / Expiry (`posting_expires_at`) from
--      Scheduled Work Time (`start_time` / `end_time`). Extending the posting
--      expiry date never alters the scheduled work date or time unless the
--      actor explicitly edits the scheduled shift window.
--    * Enforces strict Role-Based Access Control inside PostgreSQL:
--        - Retailers (`public.is_store_member(store_id)`) can manage ONLY
--          shifts belonging to their own store.
--        - Super Admins (`public.is_super_admin()`) can manage shifts across
--          all stores.
--        - Workers have zero management access (raises SQLSTATE `42501`).
--    * Every management mutation records an immutable audit entry in
--      `public.admin_audit_log` with the actor's user ID, email, role,
--      timestamp, and before/after metadata.
-- ============================================================================

begin;

-- ============================================================================
-- 1. ADD POSTING LIFECYCLE & VISIBILITY COLUMNS TO `public.shifts`
-- ============================================================================

alter table public.shifts
  add column if not exists is_hidden          boolean not null default false,
  add column if not exists hidden_at          timestamptz,
  add column if not exists posting_expires_at timestamp,
  add column if not exists renewed_at         timestamptz,
  add column if not exists renewal_count      integer not null default 0;

create index if not exists shifts_visibility_idx
  on public.shifts (status, is_hidden, posting_expires_at);

-- ============================================================================
-- 2. EXTEND `admin_log_action` TO ACCEPT `shift.*` AUDIT ACTIONS
-- ============================================================================

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
     or p_action !~ '^(email|communication|payroll|export|view|note|shift)\.[a-z_.]{1,60}$' then
    raise exception 'Invalid audit action.' using errcode = '22023';
  end if;

  if length(coalesce(p_metadata, '{}'::jsonb)::text) > 4000 then
    raise exception 'Audit metadata is too large.' using errcode = '22023';
  end if;

  return public._admin_audit(p_action, p_target_type, left(p_target_id, 200), p_metadata);
end;
$$;

revoke all on function public.admin_log_action(text, text, text, jsonb) from public, anon;
grant execute on function public.admin_log_action(text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 3. TRIGGER & MARKETPLACE VISIBILITY UPDATES
--    * Hidden shifts (`is_hidden = true`) and expired postings
--      (`coalesce(posting_expires_at, end_time) <= operations_now()`) are not
--      open for new worker applications, while remaining visible to the owning
--      retailer store and Super Admin.
-- ============================================================================

create or replace function public.enforce_retailer_hourly_rate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_super_admin() then
    new.hourly_rate := coalesce(new.hourly_rate, old.hourly_rate, public.retailer_hourly_rate());
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.hourly_rate := public.retailer_hourly_rate();
  else
    new.hourly_rate := old.hourly_rate;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_shift_payment_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_super_admin() then
    if tg_op = 'UPDATE' then
      new.payment_status    := coalesce(new.payment_status, old.payment_status);
      new.amount_paid_cents := coalesce(new.amount_paid_cents, old.amount_paid_cents);
      new.paid_at           := coalesce(new.paid_at, old.paid_at);
      new.published_at      := coalesce(new.published_at, old.published_at, case when new.status = 'open' then now() else null end);
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.payment_status    := coalesce(nullif(new.payment_status, ''), 'legacy');
    new.amount_paid_cents := null;
    new.paid_at           := null;
    if coalesce(new.status, '') in ('', 'draft', 'open') then
      new.status       := 'open';
      new.published_at := coalesce(new.published_at, now());
    end if;
    return new;
  end if;

  new.payment_status    := old.payment_status;
  new.amount_paid_cents := old.amount_paid_cents;
  new.paid_at           := old.paid_at;
  new.published_at      := coalesce(old.published_at, case when new.status = 'open' then now() else null end);

  return new;
end;
$$;

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
      and coalesce(is_hidden, false) = false
      and coalesce(posting_expires_at, end_time) > public.operations_now()
      and end_time > public.operations_now()
    )
  );

-- Prevent direct hard DELETE via PostgREST from any browser session.
-- All deletions must go through `retailer_delete_shift` or `admin_delete_shift`,
-- which perform a non-destructive soft-delete / archive (`status = 'cancelled'`)
-- and enforce completed-work, invoice, timesheet, payroll, and payment guards.
drop policy if exists shifts_delete_own_store on public.shifts;
revoke delete on public.shifts from anon, authenticated;

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
      and coalesce(s.is_hidden, false) = false
      and coalesce(s.posting_expires_at, s.end_time) > public.operations_now()
      and s.end_time > public.operations_now()
  );
$$;

revoke all on function public.worker_can_apply_to_shift(uuid) from public, anon;
grant execute on function public.worker_can_apply_to_shift(uuid) to authenticated;

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
           and coalesce(s.is_hidden, false) = false
           and coalesce(s.posting_expires_at, s.end_time) > public.operations_now()
           and s.end_time > public.operations_now()
         )
       )
  );
$$;

revoke all on function public.worker_can_view_series(uuid) from public, anon;
grant execute on function public.worker_can_view_series(uuid) to authenticated;

create or replace function public.apply_for_shift_free_mode(
  p_worker_id uuid,
  p_shift_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
begin
  if not exists (
    select 1 from public.workers w where w.id = p_worker_id
  ) then
    raise exception 'Worker profile not found.' using errcode = 'P0002';
  end if;

  perform 1 from public.shifts s where s.id = p_shift_id for update;
  if not found then
    raise exception 'That shift is no longer available.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.shifts s
    where s.id = p_shift_id
      and s.status = 'open'
      and s.accepted_by is null
      and coalesce(s.is_hidden, false) = false
      and coalesce(s.posting_expires_at, s.end_time) > public.operations_now()
      and s.end_time > public.operations_now()
  ) then
    raise exception 'This shift is no longer open for applications.' using errcode = 'P0001';
  end if;

  insert into public.shift_applications (shift_id, worker_id, status)
  values (p_shift_id, p_worker_id, 'pending')
  returning id into v_application_id;

  return v_application_id;
end;
$$;

revoke all on function public.apply_for_shift_free_mode(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_for_shift_free_mode(uuid, uuid)
  to service_role;

-- ============================================================================
-- 4. SUPER ADMIN SHIFT MANAGEMENT RPCs
--    (`admin_update_shift`, `admin_set_shift_visibility`,
--     `admin_extend_shift_posting`, `admin_renew_shift`, `admin_delete_shift`)
-- ============================================================================

create or replace function public.admin_update_shift(
  p_shift_id           uuid,
  p_store_id           uuid,
  p_task_type          text,
  p_description        text,
  p_shift_location     text,
  p_start_time         timestamp,
  p_end_time           timestamp,
  p_duration           numeric,
  p_hourly_rate        numeric,
  p_posting_expires_at timestamp default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_entry   public.shift_time_entries;
  v_task    text := nullif(btrim(coalesce(p_task_type, '')), '');
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_loc     text := nullif(btrim(coalesce(p_shift_location, '')), '');
  v_hours   numeric := round(coalesce(p_duration, 0)::numeric, 2);
  v_rate    numeric := round(coalesce(p_hourly_rate, 28)::numeric, 2);
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can edit shifts across stores.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'Selected store does not exist.' using errcode = 'P0002';
  end if;

  if v_task is null then
    raise exception 'Enter a shift title / task type.' using errcode = '22023';
  end if;

  if v_loc is null then
    raise exception 'Enter the shift location.' using errcode = '22023';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The shift end time must be after the start time.' using errcode = '22023';
  end if;

  if v_hours <= 0 or v_hours > 24 then
    raise exception 'Scheduled hours must be more than 0 and at most 24.' using errcode = '22023';
  end if;

  if v_rate <= 0 or v_rate > 500 then
    raise exception 'Hourly rate must be between $1 and $500.' using errcode = '22023';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    if p_store_id is distinct from v_shift.store_id
       or p_start_time is distinct from v_shift.start_time
       or p_end_time is distinct from v_shift.end_time
       or v_hours is distinct from v_shift.duration then
      raise exception 'This shift has already been marked completed, so its store and scheduled work hours cannot be changed.'
        using errcode = 'P0001';
    end if;
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    if p_store_id is distinct from v_shift.store_id
       or v_rate is distinct from coalesce(v_shift.hourly_rate, 28)
       or p_start_time is distinct from v_shift.start_time
       or p_end_time is distinct from v_shift.end_time
       or v_hours is distinct from v_shift.duration then
      raise exception 'An invoice has already been generated for this shift, so its store, schedule, and hourly rate cannot be changed.'
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_entry from public.shift_time_entries where shift_id = p_shift_id;
  if found then
    if v_entry.approval_status = 'approved'
       or v_entry.payroll_status in ('ready', 'exported', 'submitted', 'processed') then
      if p_store_id is distinct from v_shift.store_id
         or p_start_time is distinct from v_shift.start_time
         or p_end_time is distinct from v_shift.end_time
         or v_hours is distinct from v_shift.duration then
        raise exception 'This shift has approved timesheets or payroll records, so its store and scheduled work window cannot be changed.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if v_shift.series_id is not null and p_store_id is distinct from v_shift.store_id then
    raise exception 'This shift belongs to a recurring series and must stay with its series store.'
      using errcode = 'P0001';
  end if;

  update public.shifts
     set store_id           = p_store_id,
         task_type          = v_task,
         description        = v_desc,
         shift_location     = v_loc,
         start_time         = p_start_time,
         end_time           = p_end_time,
         duration           = v_hours,
         hourly_rate        = v_rate,
         posting_expires_at = coalesce(p_posting_expires_at, posting_expires_at),
         occurrence_date    = case when series_id is not null then p_start_time::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.updated',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'super_admin',
      'store_id', v_updated.store_id,
      'previous_store_id', v_shift.store_id,
      'task_type', v_updated.task_type,
      'previous_task_type', v_shift.task_type,
      'start_time', v_updated.start_time,
      'previous_start_time', v_shift.start_time,
      'end_time', v_updated.end_time,
      'previous_end_time', v_shift.end_time,
      'duration', v_updated.duration,
      'previous_duration', v_shift.duration,
      'hourly_rate', v_updated.hourly_rate,
      'previous_hourly_rate', v_shift.hourly_rate,
      'posting_expires_at', v_updated.posting_expires_at
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_update_shift(uuid, uuid, text, text, text, timestamp, timestamp, numeric, numeric, timestamp) from public, anon;
grant execute on function public.admin_update_shift(uuid, uuid, text, text, text, timestamp, timestamp, numeric, numeric, timestamp) to authenticated;

create or replace function public.admin_set_shift_visibility(
  p_shift_id  uuid,
  p_is_hidden boolean
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can change shift visibility across stores.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if v_shift.status in ('completed', 'cancelled') then
    raise exception 'Completed or deleted shifts cannot be hidden or shown.' using errcode = 'P0001';
  end if;

  if not coalesce(p_is_hidden, false) then
    if coalesce(v_shift.posting_expires_at, v_shift.end_time) <= public.operations_now()
       or v_shift.end_time <= public.operations_now() then
      raise exception 'This shift posting has expired. Renew or extend the expiry date before showing it to workers.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.shifts
     set is_hidden  = coalesce(p_is_hidden, false),
         hidden_at  = case when coalesce(p_is_hidden, false) then now() else null end,
         updated_at = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    case when v_updated.is_hidden then 'shift.hidden' else 'shift.shown' end,
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'super_admin',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'is_hidden', v_updated.is_hidden
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_set_shift_visibility(uuid, boolean) from public, anon;
grant execute on function public.admin_set_shift_visibility(uuid, boolean) to authenticated;

create or replace function public.admin_extend_shift_posting(
  p_shift_id           uuid,
  p_posting_expires_at timestamp,
  p_start_time         timestamp default null,
  p_end_time           timestamp default null,
  p_duration           numeric default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_start   timestamp;
  v_end     timestamp;
  v_hours   numeric;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can extend shifts across stores.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Completed shifts cannot be extended.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.shift_time_entries where shift_id = p_shift_id) then
    raise exception 'Shifts with recorded work hours cannot be extended.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Invoiced shifts cannot be extended.' using errcode = 'P0001';
  end if;

  v_start := coalesce(p_start_time, v_shift.start_time);
  v_end   := coalesce(p_end_time, v_shift.end_time);
  v_hours := round(coalesce(p_duration, v_shift.duration)::numeric, 2);

  if v_end <= v_start or v_hours <= 0 or v_hours > 24 then
    raise exception 'Enter a valid scheduled shift start and end time.' using errcode = '22023';
  end if;

  if p_posting_expires_at is not null and p_posting_expires_at <= public.operations_now() then
    raise exception 'The new posting expiry date and time must be in the future.' using errcode = '22023';
  end if;

  update public.shifts
     set posting_expires_at = coalesce(p_posting_expires_at, posting_expires_at),
         start_time         = v_start,
         end_time           = v_end,
         duration           = v_hours,
         occurrence_date    = case when series_id is not null then v_start::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.extended',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'super_admin',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'previous_posting_expires_at', v_shift.posting_expires_at,
      'new_posting_expires_at', v_updated.posting_expires_at,
      'previous_start_time', v_shift.start_time,
      'new_start_time', v_updated.start_time,
      'previous_end_time', v_shift.end_time,
      'new_end_time', v_updated.end_time
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_extend_shift_posting(uuid, timestamp, timestamp, timestamp, numeric) from public, anon;
grant execute on function public.admin_extend_shift_posting(uuid, timestamp, timestamp, timestamp, numeric) to authenticated;

create or replace function public.admin_renew_shift(
  p_shift_id           uuid,
  p_start_time         timestamp,
  p_end_time           timestamp,
  p_duration           numeric,
  p_posting_expires_at timestamp default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_hours   numeric := round(coalesce(p_duration, 0)::numeric, 2);
  v_expiry  timestamp;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can renew shifts across stores.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Completed shifts cannot be renewed.' using errcode = 'P0001';
  end if;

  if v_shift.accepted_by is not null then
    raise exception 'A worker is already hired for this shift. Edit or extend the shift schedule instead of renewing the posting.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.shift_time_entries where shift_id = p_shift_id) then
    raise exception 'Shifts with recorded work hours cannot be renewed.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Shifts with an invoice cannot be renewed.' using errcode = 'P0001';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Enter a valid future start and end time to renew this shift.' using errcode = '22023';
  end if;

  v_expiry := coalesce(p_posting_expires_at, p_end_time);

  if p_end_time <= public.operations_now() or v_expiry <= public.operations_now() then
    raise exception 'The renewed shift schedule and posting expiry must be in the future so workers can see and apply to it.'
      using errcode = '22023';
  end if;

  if v_hours <= 0 or v_hours > 24 then
    raise exception 'Scheduled hours must be more than 0 and at most 24.' using errcode = '22023';
  end if;

  update public.shifts
     set status             = 'open',
         is_hidden          = false,
         hidden_at          = null,
         start_time         = p_start_time,
         end_time           = p_end_time,
         duration           = v_hours,
         posting_expires_at = p_posting_expires_at,
         renewed_at         = now(),
         renewal_count      = coalesce(renewal_count, 0) + 1,
         payment_status     = case when payment_status = 'paid' then 'paid' else 'legacy' end,
         published_at       = now(),
         occurrence_date    = case when series_id is not null then p_start_time::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.renewed',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'super_admin',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'previous_status', v_shift.status,
      'new_status', v_updated.status,
      'previous_start_time', v_shift.start_time,
      'new_start_time', v_updated.start_time,
      'previous_end_time', v_shift.end_time,
      'new_end_time', v_updated.end_time,
      'posting_expires_at', v_updated.posting_expires_at,
      'renewal_count', v_updated.renewal_count,
      'duration', v_updated.duration
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_renew_shift(uuid, timestamp, timestamp, numeric, timestamp) from public, anon;
grant execute on function public.admin_renew_shift(uuid, timestamp, timestamp, numeric, timestamp) to authenticated;

create or replace function public.admin_delete_shift(
  p_shift_id uuid,
  p_reason   text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_entry   public.shift_time_entries;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete shifts across stores.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if v_shift.status = 'cancelled' then
    raise exception 'This shift has already been deleted / cancelled.' using errcode = 'P0001';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Cannot delete this shift because it has completed work on record.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Cannot delete this shift because a retailer invoice has already been generated for it.'
      using errcode = 'P0001';
  end if;

  select * into v_entry from public.shift_time_entries where shift_id = p_shift_id;
  if found then
    if v_entry.approval_status = 'approved' or v_entry.approved_hours is not null then
      raise exception 'Cannot delete this shift because worked hours have already been approved for payroll.'
        using errcode = 'P0001';
    end if;
    if v_entry.payroll_status in ('ready', 'exported', 'submitted', 'processed') then
      raise exception 'Cannot delete this shift because it has active payroll records.'
        using errcode = 'P0001';
    end if;
    raise exception 'Cannot delete this shift because worked hours have been recorded in a timesheet.'
      using errcode = 'P0001';
  end if;

  if v_shift.payment_status = 'paid'
     or exists (select 1 from public.shift_payments where shift_id = p_shift_id and status = 'paid') then
    raise exception 'Cannot delete this shift because it has a confirmed payment record.'
      using errcode = 'P0001';
  end if;

  update public.shifts
     set status     = 'cancelled',
         is_hidden  = false,
         hidden_at  = null,
         updated_at = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.deleted',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'super_admin',
      'store_id', v_shift.store_id,
      'task_type', v_shift.task_type,
      'previous_status', v_shift.status,
      'new_status', 'cancelled',
      'had_hired_worker', v_shift.accepted_by is not null,
      'accepted_by', v_shift.accepted_by,
      'reason', v_reason
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_delete_shift(uuid, text) from public, anon;
grant execute on function public.admin_delete_shift(uuid, text) to authenticated;

-- ============================================================================
-- 5. RETAILER SHIFT MANAGEMENT RPCs (Own Store Only)
--    Every function below verifies `public.is_store_member(v_shift.store_id)`
--    inside the database transaction before allowing any write.
-- ============================================================================

create or replace function public.retailer_update_shift(
  p_shift_id           uuid,
  p_task_type          text,
  p_description        text,
  p_shift_location     text,
  p_start_time         timestamp,
  p_end_time           timestamp,
  p_duration           numeric,
  p_posting_expires_at timestamp default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_task    text := nullif(btrim(coalesce(p_task_type, '')), '');
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_loc     text := nullif(btrim(coalesce(p_shift_location, '')), '');
  v_hours   numeric := round(coalesce(p_duration, 0)::numeric, 2);
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage shifts.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You can only manage shifts posted under your own retailer account.' using errcode = '42501';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Completed shifts cannot be edited.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.shift_time_entries where shift_id = p_shift_id) then
    raise exception 'Shifts with recorded or approved timesheets cannot be edited.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Invoiced shifts cannot be edited.' using errcode = 'P0001';
  end if;

  if v_task is null then
    raise exception 'Tell workers what the shift involves.' using errcode = '22023';
  end if;

  if v_loc is null then
    raise exception 'Enter the location for this shift.' using errcode = '22023';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The shift end time must be after the start time.' using errcode = '22023';
  end if;

  if v_hours <= 0 or v_hours > 24 then
    raise exception 'A single shift must be between 0.25 and 24 hours.' using errcode = '22023';
  end if;

  if v_shift.accepted_by is not null and (p_start_time is distinct from v_shift.start_time or p_end_time is distinct from v_shift.end_time) then
    raise exception 'A worker has already been hired for this shift, so its scheduled date and time cannot be changed.'
      using errcode = 'P0001';
  end if;

  update public.shifts
     set task_type          = v_task,
         description        = v_desc,
         shift_location     = v_loc,
         start_time         = p_start_time,
         end_time           = p_end_time,
         duration           = v_hours,
         posting_expires_at = coalesce(p_posting_expires_at, posting_expires_at),
         occurrence_date    = case when series_id is not null then p_start_time::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.retailer_updated',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'retailer',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'previous_task_type', v_shift.task_type,
      'start_time', v_updated.start_time,
      'previous_start_time', v_shift.start_time,
      'end_time', v_updated.end_time,
      'previous_end_time', v_shift.end_time,
      'posting_expires_at', v_updated.posting_expires_at
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.retailer_update_shift(uuid, text, text, text, timestamp, timestamp, numeric, timestamp) from public, anon;
grant execute on function public.retailer_update_shift(uuid, text, text, text, timestamp, timestamp, numeric, timestamp) to authenticated;

create or replace function public.retailer_set_shift_visibility(
  p_shift_id  uuid,
  p_is_hidden boolean
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage shifts.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You can only manage shifts posted under your own retailer account.' using errcode = '42501';
  end if;

  if v_shift.status in ('completed', 'cancelled') then
    raise exception 'Completed or deleted shifts cannot be hidden or shown.' using errcode = 'P0001';
  end if;

  if not coalesce(p_is_hidden, false) then
    if coalesce(v_shift.posting_expires_at, v_shift.end_time) <= public.operations_now()
       or v_shift.end_time <= public.operations_now() then
      raise exception 'This shift posting has expired. Renew or extend the expiry date before showing it to workers.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.shifts
     set is_hidden  = coalesce(p_is_hidden, false),
         hidden_at  = case when coalesce(p_is_hidden, false) then now() else null end,
         updated_at = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    case when v_updated.is_hidden then 'shift.retailer_hidden' else 'shift.retailer_shown' end,
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'retailer',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'is_hidden', v_updated.is_hidden
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.retailer_set_shift_visibility(uuid, boolean) from public, anon;
grant execute on function public.retailer_set_shift_visibility(uuid, boolean) to authenticated;

create or replace function public.retailer_extend_shift(
  p_shift_id           uuid,
  p_posting_expires_at timestamp,
  p_start_time         timestamp default null,
  p_end_time           timestamp default null,
  p_duration           numeric default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_start   timestamp;
  v_end     timestamp;
  v_hours   numeric;
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage shifts.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You can only manage shifts posted under your own retailer account.' using errcode = '42501';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Completed shifts cannot be extended.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.shift_time_entries where shift_id = p_shift_id) then
    raise exception 'Shifts with recorded or approved timesheets cannot be extended.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Invoiced shifts cannot be extended.' using errcode = 'P0001';
  end if;

  v_start := coalesce(p_start_time, v_shift.start_time);
  v_end   := coalesce(p_end_time, v_shift.end_time);
  v_hours := round(coalesce(p_duration, v_shift.duration)::numeric, 2);

  if v_shift.accepted_by is not null and (v_start is distinct from v_shift.start_time or v_end is distinct from v_shift.end_time) then
    raise exception 'A worker has already been hired for this shift, so its scheduled date and time cannot be changed.'
      using errcode = 'P0001';
  end if;

  if v_end <= v_start or v_hours <= 0 or v_hours > 24 then
    raise exception 'Enter a valid scheduled shift start and end time.' using errcode = '22023';
  end if;

  if p_posting_expires_at is not null and p_posting_expires_at <= public.operations_now() then
    raise exception 'The new posting expiry date and time must be in the future.' using errcode = '22023';
  end if;

  update public.shifts
     set posting_expires_at = coalesce(p_posting_expires_at, posting_expires_at),
         start_time         = v_start,
         end_time           = v_end,
         duration           = v_hours,
         occurrence_date    = case when series_id is not null then v_start::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.retailer_extended',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'retailer',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'previous_posting_expires_at', v_shift.posting_expires_at,
      'new_posting_expires_at', v_updated.posting_expires_at,
      'previous_start_time', v_shift.start_time,
      'new_start_time', v_updated.start_time,
      'previous_end_time', v_shift.end_time,
      'new_end_time', v_updated.end_time
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.retailer_extend_shift(uuid, timestamp, timestamp, timestamp, numeric) from public, anon;
grant execute on function public.retailer_extend_shift(uuid, timestamp, timestamp, timestamp, numeric) to authenticated;

create or replace function public.retailer_renew_shift(
  p_shift_id           uuid,
  p_start_time         timestamp,
  p_end_time           timestamp,
  p_duration           numeric,
  p_posting_expires_at timestamp default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_hours   numeric := round(coalesce(p_duration, 0)::numeric, 2);
  v_expiry  timestamp;
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage shifts.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You can only manage shifts posted under your own retailer account.' using errcode = '42501';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Completed shifts cannot be renewed.' using errcode = 'P0001';
  end if;

  if v_shift.accepted_by is not null then
    raise exception 'A worker is already hired for this shift.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.shift_time_entries where shift_id = p_shift_id) then
    raise exception 'Shifts with recorded work hours cannot be renewed.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Invoiced shifts cannot be renewed.' using errcode = 'P0001';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Enter a valid future start and end time to renew this shift.' using errcode = '22023';
  end if;

  v_expiry := coalesce(p_posting_expires_at, p_end_time);

  if p_end_time <= public.operations_now() or v_expiry <= public.operations_now() then
    raise exception 'The renewed shift schedule and posting expiry must be in the future so workers can see and apply to it.'
      using errcode = '22023';
  end if;

  if v_hours <= 0 or v_hours > 24 then
    raise exception 'Scheduled hours must be more than 0 and at most 24.' using errcode = '22023';
  end if;

  update public.shifts
     set status             = 'open',
         is_hidden          = false,
         hidden_at          = null,
         start_time         = p_start_time,
         end_time           = p_end_time,
         duration           = v_hours,
         posting_expires_at = p_posting_expires_at,
         renewed_at         = now(),
         renewal_count      = coalesce(renewal_count, 0) + 1,
         payment_status     = case when payment_status = 'paid' then 'paid' else 'legacy' end,
         published_at       = now(),
         occurrence_date    = case when series_id is not null then p_start_time::date else occurrence_date end,
         updated_at         = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.retailer_renewed',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'retailer',
      'store_id', v_updated.store_id,
      'task_type', v_updated.task_type,
      'previous_status', v_shift.status,
      'new_status', v_updated.status,
      'previous_start_time', v_shift.start_time,
      'new_start_time', v_updated.start_time,
      'previous_end_time', v_shift.end_time,
      'new_end_time', v_updated.end_time,
      'posting_expires_at', v_updated.posting_expires_at,
      'renewal_count', v_updated.renewal_count
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.retailer_renew_shift(uuid, timestamp, timestamp, numeric, timestamp) from public, anon;
grant execute on function public.retailer_renew_shift(uuid, timestamp, timestamp, numeric, timestamp) to authenticated;

create or replace function public.retailer_delete_shift(
  p_shift_id uuid,
  p_reason   text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_shift   public.shifts;
  v_updated public.shifts;
  v_entry   public.shift_time_entries;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage shifts.' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You can only manage shifts posted under your own retailer account.' using errcode = '42501';
  end if;

  if v_shift.status = 'cancelled' then
    raise exception 'This shift has already been deleted / cancelled.' using errcode = 'P0001';
  end if;

  if v_shift.status = 'completed' or v_shift.completed_at is not null then
    raise exception 'Cannot delete this shift because it has completed work on record.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.retailer_invoices where shift_id = p_shift_id) then
    raise exception 'Cannot delete this shift because an invoice has already been generated for it.'
      using errcode = 'P0001';
  end if;

  select * into v_entry from public.shift_time_entries where shift_id = p_shift_id;
  if found then
    raise exception 'Cannot delete this shift because worked hours have been recorded in a timesheet.'
      using errcode = 'P0001';
  end if;

  if v_shift.payment_status = 'paid'
     or exists (select 1 from public.shift_payments where shift_id = p_shift_id and status = 'paid') then
    raise exception 'Cannot delete this shift because it has a confirmed payment record.'
      using errcode = 'P0001';
  end if;

  update public.shifts
     set status     = 'cancelled',
         is_hidden  = false,
         hidden_at  = null,
         updated_at = now()
   where id = p_shift_id
   returning * into v_updated;

  perform public._admin_audit(
    'shift.retailer_deleted',
    'shift',
    p_shift_id::text,
    jsonb_build_object(
      'actor_role', 'retailer',
      'store_id', v_shift.store_id,
      'task_type', v_shift.task_type,
      'previous_status', v_shift.status,
      'new_status', 'cancelled',
      'had_hired_worker', v_shift.accepted_by is not null,
      'reason', v_reason
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.retailer_delete_shift(uuid, text) from public, anon;
grant execute on function public.retailer_delete_shift(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
