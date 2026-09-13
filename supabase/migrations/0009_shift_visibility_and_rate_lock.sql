-- ============================================================================
--  ShiftSupport — Migration 0009
--  Two gaps found during the Stripe QA run, both pre-existing:
--
--   1. `public.shifts` carries an extra permissive SELECT policy alongside
--      `shifts_select`. RLS policies are OR-ed, so that one policy overrides
--      every restriction the others express: a signed-in worker could read
--      EVERY shift row in the table — other stores' cancelled shifts, filled
--      shifts, and unpaid drafts that have not been published yet.
--
--      Verified with a real worker session during QA: the worker saw 7 of 7
--      shifts, while the same session correctly saw 1 of 8 profiles, 0 of 6
--      applications and 0 of 1 shift_payments. So RLS is working — `shifts`
--      simply has a policy that lets everything through.
--
--      They could not APPLY to those shifts (the INSERT policy and the server
--      action both refuse), so this is disclosure, not an ability to work an
--      unpaid shift. Still, draft shifts should not be readable.
--
--   2. Migration 0006 (`shifts_enforce_hourly_rate`) was never applied to this
--      database. QA confirmed it: a retailer's own session changed
--      `hourly_rate` from 28 to 5 with a direct PostgREST PATCH. The money is
--      unaffected — checkout always recomputes hours x the platform rate from
--      `lib/pricing`, never from the row — but the rate shown on a shift card
--      could be made to lie. 0006 is re-applied below, idempotently.
--
--  ADDITIVE AND IDEMPOTENT. No table, row or column is dropped; only the stray
--  SELECT policies on `shifts` are removed, and they are named in the output.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

-- ============================================================================
-- 1. ONE SELECT POLICY ON shifts, NOT SEVERAL
--    Anything other than `shifts_select` is dropped, and reported as a NOTICE
--    so there is a record of what was removed.
-- ============================================================================

do $$
declare
  v_policy text;
  v_dropped int := 0;
begin
  for v_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'shifts'
       and policyname <> 'shifts_select'
       and cmd in ('SELECT', 'ALL')
  loop
    raise notice 'Dropping over-permissive policy on public.shifts: %', v_policy;
    execute format('drop policy if exists %I on public.shifts', v_policy);
    v_dropped := v_dropped + 1;
  end loop;

  if v_dropped = 0 then
    raise notice 'No extra SELECT policies found on public.shifts.';
  end if;
end $$;

-- The canonical policy, restated exactly as migration 0007 left it: the
-- store's own members, the hired worker, previous applicants, and anybody
-- while the shift is genuinely open AND paid for.
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

-- ============================================================================
-- 2. RE-APPLY MIGRATION 0006 — the retailer rate is the platform's, not the
--    store's. Identical to 0006; safe whether or not that file ever ran.
-- ============================================================================

create or replace function public.retailer_hourly_rate()
returns numeric language sql immutable set search_path = public as $$
  select 28::numeric;
$$;

comment on function public.retailer_hourly_rate() is
  'Platform hourly rate charged to retailers. Mirrors RETAILER_HOURLY_RATE in lib/pricing.ts.';

create or replace function public.enforce_retailer_hourly_rate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Trusted server-side tooling (the service role) keeps full control.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.hourly_rate := public.retailer_hourly_rate();
  else
    -- Whatever else the update changes, the rate stays as it was.
    new.hourly_rate := old.hourly_rate;
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_enforce_hourly_rate on public.shifts;
create trigger shifts_enforce_hourly_rate
  before insert or update on public.shifts
  for each row execute function public.enforce_retailer_hourly_rate();

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 3. VERIFY — expect exactly one SELECT policy, and both triggers present.
-- ============================================================================

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'shifts'
 order by policyname;

select tgname
  from pg_trigger
 where tgrelid = 'public.shifts'::regclass
   and not tgisinternal
 order by tgname;
