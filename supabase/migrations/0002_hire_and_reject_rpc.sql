-- ============================================================================
--  ShiftSupport — Migration 0002
--  Transaction-safe hiring / rejecting.
--
--  Hiring must never allow two workers to be approved for the same shift.
--  Both functions run as SECURITY DEFINER, take a row lock on the shift, and
--  re-verify authorisation from auth.uid() — so a tampered client cannot hire
--  for a shift it does not own, and two simultaneous "Hire" clicks cannot both
--  win: the second one blocks on the lock, then fails the accepted_by check.
--
--  Run AFTER 0001, in: Supabase Dashboard -> SQL Editor
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- hire_applicant(application_id)
-- ---------------------------------------------------------------------------
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
begin
  select * into v_app from public.shift_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
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

  return json_build_object(
    'ok', true,
    'shift_id', v_shift.id,
    'application_id', v_app.id,
    'worker_id', v_app.worker_id,
    'worker_name', v_worker.full_name,
    'store_name', v_store_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_application(application_id, reason)
-- ---------------------------------------------------------------------------
create or replace function public.reject_application(
  p_application_id uuid,
  p_reason         text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app        public.shift_applications;
  v_shift      public.shifts;
  v_store_name text;
  v_auth_id    uuid;
begin
  select * into v_app from public.shift_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;

  select * into v_shift from public.shifts where id = v_app.shift_id for update;

  if not public.is_store_member(v_shift.store_id) then
    raise exception 'You are not authorised to review this application.' using errcode = '42501';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'This application has already been reviewed.' using errcode = 'P0001';
  end if;

  select name into v_store_name from public.stores where id = v_shift.store_id;

  update public.shift_applications
     set status           = 'rejected',
         reviewed_at      = now(),
         rejection_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = v_app.id;

  select auth_user_id into v_auth_id from public.workers where id = v_app.worker_id;

  if v_auth_id is not null then
    insert into public.notifications (user_id, type, title, body, shift_id)
    values (
      v_auth_id,
      'not_selected',
      'Application update',
      format('You were not selected for the %s shift at %s.', v_shift.task_type, v_store_name),
      v_shift.id
    );
  end if;

  return json_build_object('ok', true, 'application_id', v_app.id);
end;
$$;

revoke execute on function public.hire_applicant(uuid)             from public, anon;
revoke execute on function public.reject_application(uuid, text)   from public, anon;
grant  execute on function public.hire_applicant(uuid)             to authenticated;
grant  execute on function public.reject_application(uuid, text)   to authenticated;

commit;

notify pgrst, 'reload schema';
