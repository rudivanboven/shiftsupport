-- ==========================================================================
-- ShiftSupport — Migration 0015
-- Atomic shift application for the temporary free worker access mode.
--
-- The existing shift_applications INSERT policy checks stored membership.
-- Free access must not rewrite that membership state, so free-mode applications
-- use this narrowly scoped service-role RPC. It takes the same shift row lock
-- as hiring and rechecks that the shift is open, unfilled, and paid before
-- inserting. The authenticated browser role cannot execute this function.
--
-- Apply after migrations 0001 and 0007. No existing policy or data is changed.
-- ==========================================================================

begin;

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

  -- Serialise with hire_applicant and re-check after any concurrent update.
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
      and s.payment_status in ('paid', 'legacy')
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

commit;

notify pgrst, 'reload schema';
