-- ============================================================================
-- ShiftSupport — Migration 0003
-- Remove indirect RLS recursion between workers, shifts and shift_applications.
-- No tables or application rows are changed; RLS remains enabled.
-- ============================================================================

begin;

-- These helpers run as the migration owner and therefore perform only the
-- narrowly defined ownership lookups without invoking table RLS recursively.
-- Empty search_path plus fully qualified names prevents object-shadowing.

create or replace function public.worker_has_applied_to_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shift_applications sa
    join public.workers w on w.id = sa.worker_id
    where sa.shift_id = p_shift_id
      and w.auth_user_id = auth.uid()
  );
$$;

create or replace function public.retailer_can_manage_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shifts s
    join public.store_users su on su.store_id = s.store_id
    where s.id = p_shift_id
      and su.auth_user_id = auth.uid()
  );
$$;

create or replace function public.retailer_can_view_worker(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_users su
    join public.shifts s on s.store_id = su.store_id
    left join public.shift_applications sa
      on sa.shift_id = s.id and sa.worker_id = p_worker_id
    where su.auth_user_id = auth.uid()
      and (sa.id is not null or s.accepted_by = p_worker_id)
  );
$$;

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
  );
$$;

revoke all on function public.worker_has_applied_to_shift(uuid) from public;
revoke all on function public.retailer_can_manage_shift(uuid) from public;
revoke all on function public.retailer_can_view_worker(uuid) from public;
revoke all on function public.worker_can_apply_to_shift(uuid) from public;

grant execute on function public.worker_has_applied_to_shift(uuid) to authenticated;
grant execute on function public.retailer_can_manage_shift(uuid) to authenticated;
grant execute on function public.retailer_can_view_worker(uuid) to authenticated;
grant execute on function public.worker_can_apply_to_shift(uuid) to authenticated;

-- workers -> shift_applications was one entry point into the recursive chain.
drop policy if exists workers_select_for_store on public.workers;
create policy workers_select_for_store on public.workers
  for select to authenticated
  using (public.retailer_can_view_worker(id));

-- shifts -> shift_applications was the other half of the cycle.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select to authenticated
  using (
    public.is_store_member(store_id)
    or (accepted_by is not null and accepted_by = public.current_worker_id())
    or public.worker_has_applied_to_shift(id)
    or (status = 'open' and accepted_by is null)
  );

-- Application policies no longer query the RLS-protected shifts table.
drop policy if exists shift_applications_select on public.shift_applications;
create policy shift_applications_select on public.shift_applications
  for select to authenticated
  using (
    worker_id = public.current_worker_id()
    or public.retailer_can_manage_shift(shift_id)
  );

drop policy if exists shift_applications_insert_own on public.shift_applications;
create policy shift_applications_insert_own on public.shift_applications
  for insert to authenticated
  with check (
    worker_id = public.current_worker_id()
    and status = 'pending'
    and public.worker_can_apply_to_shift(shift_id)
  );

drop policy if exists shift_applications_update_store on public.shift_applications;
create policy shift_applications_update_store on public.shift_applications
  for update to authenticated
  using (public.retailer_can_manage_shift(shift_id))
  with check (public.retailer_can_manage_shift(shift_id));

commit;

notify pgrst, 'reload schema';
