-- Fixed retailer rate
--
-- The hourly rate a retailer pays is set by the platform, not by the store
-- posting the shift. `createShift` already writes the platform rate and never
-- reads one from the request, but a retailer's browser holds a Supabase
-- session and `shifts_insert_own_store` checks only store membership — so a
-- hand-rolled PostgREST insert could still land a shift at any price.
--
-- This trigger closes that path at the table: the rate on a shift written by a
-- signed-in user is always the platform rate, whatever the payload said.
--
-- Historical rows are left exactly as they are; the trigger only fires on
-- writes, and on update it restores the rate the row already had rather than
-- rewriting legacy shifts to the new rate.

-- ---------- the rate itself, in one place ----------

create or replace function public.retailer_hourly_rate()
returns numeric language sql immutable set search_path = public as $$
  select 28::numeric;
$$;

comment on function public.retailer_hourly_rate() is
  'Platform hourly rate charged to retailers. Mirrors RETAILER_HOURLY_RATE in lib/pricing.ts.';

-- ---------- enforcement ----------

create or replace function public.enforce_retailer_hourly_rate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Trusted server-side tooling (the service role) keeps full control, e.g.
  -- for seeding or back-office corrections. It is never exposed to a browser.
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
