-- ============================================================================
--  ShiftSupport — Migration 0020
--  Auth Profile & Account Reconciliation: Database Trigger + Non-Destructive
--  Backfill for Existing Auth Users.
--
--  WHY
--    1. Production currently has 65 `auth.users` rows and 48 `public.profiles`
--       rows (17 existing accounts are missing their `public.profiles` row,
--       and 1 additional worker account has a `public.profiles` row without a
--       `public.workers` row).
--    2. Without a `public.profiles` row, `signIn()` previously saw `role = null`
--       and rejected valid logins with:
--       "This account isn't set up yet. Please sign up first."
--
--  WHAT THIS MIGRATION DOES
--    1. Creates a non-destructive `AFTER INSERT ON auth.users` trigger
--       (`public.handle_new_auth_user_profile`) that guarantees every new
--       worker or retailer auth user has a matching `public.profiles` row
--       initialised from `raw_user_meta_data` / `raw_app_meta_data` inside
--       the same transaction as `auth.users` creation, while respecting
--       dedicated Super Admin account separation (`migration 0011`).
--       If an earlier `profiles` row was inserted by an existing trigger with
--       a default `'worker'` role before `provisionRetailer` ran, it also
--       corrects `role = 'retailer'` when `raw_user_meta_data->>'role'` is
--       `'retailer'`.
--    2. Backfills missing `public.profiles` rows for existing `auth.users`
--       whose role is known from `store_users`, `workers`, `raw_app_meta_data`,
--       or `raw_user_meta_data` (excluding active `super_admins`).
--    3. Links any unlinked legacy `public.workers` rows (`auth_user_id IS NULL`)
--       by matching email, then inserts missing `public.workers` rows for
--       remaining worker accounts (`ON CONFLICT (auth_user_id) DO NOTHING`).
--    4. Links any unlinked `public.store_users` rows (`auth_user_id IS NULL`)
--       by matching email, reuses any matching unowned `public.stores` row
--       before creating a new store, and inserts missing `public.store_users`
--       rows (`ON CONFLICT (auth_user_id) DO NOTHING`).
--    5. Ensures any backfilled retailer store schedule in
--       `public.retailer_onboarding_reminders` has a future `next_reminder_due_at`
--       (`now() + interval '14 days'`) so backfilling historical accounts from
--       September–November never triggers an immediate catch-up reminder email
--       on the next daily cron run.
--
--  SAFETY NOTES
--    * ADDITIVE & IDEMPOTENT (`ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`).
--    * Never deletes, overwrites, or modifies existing valid `profiles`,
--      `workers`, `stores`, `store_users`, `super_admins`, shifts, applications,
--      invoices, payments, or payroll records.
-- ============================================================================

begin;

-- ============================================================================
-- 1. TRIGGER — Guarantee `public.profiles` on `auth.users` INSERT
-- ============================================================================

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_full_name text;
  v_phone text;
begin
  v_role := coalesce(
    nullif(btrim(new.raw_app_meta_data->>'role'), ''),
    nullif(btrim(new.raw_user_meta_data->>'role'), '')
  );

  -- Only auto-create a profile row when the auth user explicitly carries a
  -- valid worker/retailer/admin role in metadata. Dedicated operations accounts
  -- created in the Supabase dashboard without a worker/retailer role are left
  -- untouched so Super Admin separation (migration 0011) remains intact.
  if v_role not in ('worker', 'retailer', 'admin') then
    return new;
  end if;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');

  insert into public.profiles (id, full_name, email, phone, role, created_at, updated_at)
  values (
    new.id,
    v_full_name,
    lower(new.email),
    v_phone,
    v_role,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
     set role = case
           when excluded.role = 'retailer' and public.profiles.role = 'worker' then 'retailer'
           else coalesce(public.profiles.role, excluded.role)
         end,
         full_name  = coalesce(nullif(btrim(public.profiles.full_name), ''), excluded.full_name),
         email      = coalesce(nullif(btrim(public.profiles.email), ''), excluded.email),
         phone      = coalesce(nullif(btrim(public.profiles.phone), ''), excluded.phone),
         updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

-- ============================================================================
-- 2. BACKFILL MISSING `public.profiles` FOR EXISTING AUTH USERS
-- ============================================================================

insert into public.profiles (id, full_name, email, phone, role, created_at, updated_at)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    (select w.full_name from public.workers w where w.auth_user_id = u.id limit 1),
    split_part(coalesce(u.email, ''), '@', 1)
  ) as full_name,
  lower(u.email) as email,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'phone'), ''),
    (select w.phone from public.workers w where w.auth_user_id = u.id limit 1)
  ) as phone,
  case
    when exists (select 1 from public.store_users su where su.auth_user_id = u.id) then 'retailer'
    when exists (select 1 from public.workers w where w.auth_user_id = u.id) then 'worker'
    when coalesce(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role') = 'retailer' then 'retailer'
    when coalesce(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role') = 'worker' then 'worker'
    else null
  end as role,
  coalesce(u.created_at, now()) as created_at,
  now() as updated_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.super_admins sa where sa.user_id = u.id and sa.status = 'active')
  and (
    exists (select 1 from public.store_users su where su.auth_user_id = u.id)
    or exists (select 1 from public.workers w where w.auth_user_id = u.id)
    or coalesce(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role') in ('worker', 'retailer')
  )
on conflict (id) do nothing;

-- ============================================================================
-- 3. BACKFILL MISSING `public.workers` FOR EXISTING WORKER ACCOUNTS
-- ============================================================================

-- 3a. First link any unlinked legacy worker row (`auth_user_id is null`) with matching email
update public.workers w
   set auth_user_id = u.id,
       full_name    = coalesce(nullif(btrim(w.full_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), '')),
       phone        = coalesce(nullif(btrim(w.phone), ''), nullif(btrim(p.phone), ''), nullif(btrim(u.raw_user_meta_data->>'phone'), '')),
       updated_at   = now()
  from auth.users u
  join public.profiles p on p.id = u.id
 where p.role = 'worker'
   and w.auth_user_id is null
   and w.email is not null
   and lower(btrim(w.email)) = lower(btrim(u.email))
   and not exists (select 1 from public.workers w2 where w2.auth_user_id = u.id)
   and not exists (select 1 from public.store_users su where su.auth_user_id = u.id)
   and not exists (select 1 from public.super_admins sa where sa.user_id = u.id and sa.status = 'active');

-- 3b. Insert missing worker rows for any remaining worker accounts
insert into public.workers (auth_user_id, full_name, email, phone, created_at, updated_at)
select
  u.id as auth_user_id,
  coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ) as full_name,
  lower(coalesce(p.email, u.email)) as email,
  coalesce(
    nullif(btrim(p.phone), ''),
    nullif(btrim(u.raw_user_meta_data->>'phone'), '')
  ) as phone,
  coalesce(u.created_at, now()) as created_at,
  now() as updated_at
from auth.users u
join public.profiles p on p.id = u.id
where p.role = 'worker'
  and not exists (select 1 from public.workers w where w.auth_user_id = u.id)
  and not exists (select 1 from public.store_users su where su.auth_user_id = u.id)
  and not exists (select 1 from public.super_admins sa where sa.user_id = u.id and sa.status = 'active')
on conflict (auth_user_id) where auth_user_id is not null do nothing;

-- ============================================================================
-- 4. BACKFILL MISSING `public.stores` AND `public.store_users` FOR RETAILERS
-- ============================================================================

-- 4a. First link any unlinked `store_users` row (`auth_user_id is null`) with matching email
update public.store_users su
   set auth_user_id = u.id,
       updated_at   = now()
  from auth.users u
  join public.profiles p on p.id = u.id
 where p.role = 'retailer'
   and su.auth_user_id is null
   and su.email is not null
   and lower(btrim(su.email)) = lower(btrim(u.email))
   and not exists (select 1 from public.store_users su2 where su2.auth_user_id = u.id)
   and not exists (select 1 from public.super_admins sa where sa.user_id = u.id and sa.status = 'active');

-- 4b. Reconcile stores and `store_users` for any remaining retailer accounts
do $$
declare
  r record;
  v_store_id uuid;
  v_store_name text;
  v_store_address text;
  v_store_phone text;
  v_reconcile_time timestamptz := transaction_timestamp();
begin
  for r in
    select
      u.id as user_id,
      lower(u.email) as email,
      u.created_at,
      p.full_name,
      p.phone as profile_phone,
      nullif(btrim(u.raw_user_meta_data->>'store_name'), '') as meta_store_name,
      nullif(btrim(u.raw_user_meta_data->>'store_address'), '') as meta_store_address,
      nullif(btrim(u.raw_user_meta_data->>'store_phone'), '') as meta_store_phone,
      nullif(btrim(u.raw_user_meta_data->>'phone'), '') as meta_phone
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.role = 'retailer'
      and not exists (select 1 from public.store_users su where su.auth_user_id = u.id)
      and not exists (select 1 from public.super_admins sa where sa.user_id = u.id and sa.status = 'active')
    order by u.created_at asc, u.id asc
  loop
    v_store_id := null;
    v_store_name := coalesce(
      r.meta_store_name,
      case when nullif(btrim(r.full_name), '') is not null then btrim(r.full_name) || '''s Store' else 'Retailer Store' end
    );
    v_store_address := r.meta_store_address;
    v_store_phone := coalesce(r.meta_store_phone, r.profile_phone, r.meta_phone);

    -- Check for an existing unowned store with the exact name (and compatible phone)
    if r.meta_store_name is not null then
      select s.id into v_store_id
        from public.stores s
       where lower(btrim(s.name)) = lower(btrim(r.meta_store_name))
         and not exists (select 1 from public.store_users su where su.store_id = s.id)
         and (v_store_phone is null or s.contact_phone is null or s.contact_phone = v_store_phone)
       order by s.created_at asc
       limit 1;
    end if;

    if v_store_id is null then
      insert into public.stores (name, address, contact_phone, created_at, updated_at)
      values (v_store_name, v_store_address, v_store_phone, coalesce(r.created_at, v_reconcile_time), v_reconcile_time)
      returning id into v_store_id;
    end if;

    -- Use `v_reconcile_time` for `store_users.created_at` so the `store_users_init_onboarding_reminder`
    -- trigger schedules `next_reminder_due_at = v_reconcile_time + interval '14 days'`
    -- rather than a past date that would fire an immediate catch-up email on the next cron run.
    insert into public.store_users (store_id, auth_user_id, email, role, created_at, updated_at)
    values (v_store_id, r.user_id, r.email, 'owner', v_reconcile_time, v_reconcile_time)
    on conflict (auth_user_id) where auth_user_id is not null do nothing;

    -- Preserve historical `registered_at` in `retailer_onboarding_reminders` while keeping
    -- `next_reminder_due_at` 14 days in the future.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'retailer_onboarding_reminders'
    ) then
      update public.retailer_onboarding_reminders
         set registered_at        = coalesce(r.created_at, registered_at),
             next_reminder_due_at = greatest(next_reminder_due_at, v_reconcile_time + interval '14 days'),
             updated_at           = v_reconcile_time
       where store_id = v_store_id
         and reminders_sent_count = 0
         and first_shift_posted_at is null
         and stopped_at is null;
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
