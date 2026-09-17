-- ============================================================================
--  ShiftSupport — Migration 0011
--  Fix: `grant_super_admin()` refused every fresh operations login.
--
--  WHY
--    This database has a trigger on `auth.users` that creates a `public.profiles`
--    row with role 'worker' for EVERY new auth user (verified: the profile row's
--    created_at precedes the auth user's own created_at by a fraction of a
--    millisecond, and profiles count == auth.users count). So `profiles.role`
--    cannot tell a real worker from a brand-new, dedicated operations account.
--
--    Migration 0010's separation check read `profiles.role`, which therefore
--    matched every new account. Its effects were:
--      * `grant_super_admin()` refused every candidate with
--        "That email belongs to a worker or retailer account";
--      * the §9 bootstrap SELECT matched zero rows, so the INSERT inserted
--        nothing while the SQL editor still reported "Success".
--
--  THE FIX
--    Test what actually marks a worker or retailer ACCOUNT: the record that
--    signup provisions. `provisionWorker` always inserts a `workers` row, and
--    `provisionRetailer` always inserts a `store_users` row (plus the store) —
--    see app/actions/auth.ts. Those two tables are the reliable markers; the
--    trigger-created profile row is not. This is a STRICTER test in practice
--    than the old one, because a real worker or retailer always has one.
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. Replaces exactly one function that migration 0010 itself
--      created. No existing table, column, row, policy or trigger is touched,
--      and nothing that predates 0010 is modified.
--    * The trigger on auth.users is left exactly as it is. Worker and retailer
--      signup, login and dashboards are unaffected.
--    * Grants nobody access. Access still comes only from
--      `grant_super_admin()` or the bootstrap INSERT.
--    * Safe to re-run.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
--  Then run the bootstrap block in §2 below, once, to create the primary admin.
-- ============================================================================

begin;

-- ============================================================================
-- 1. grant_super_admin() — same function, corrected separation test
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
  -- The marker is the record signup provisions, NOT profiles.role: a trigger on
  -- auth.users gives every new auth user a profiles row with role 'worker', so
  -- reading the role here would refuse every dedicated operations login.
  if exists (select 1 from public.workers w where w.auth_user_id = v_target.id)
     or exists (select 1 from public.store_users su where su.auth_user_id = v_target.id) then
    raise exception 'That email belongs to a worker or retailer account. Use a dedicated operations login for Super Admin access.'
      using errcode = 'P0001';
  end if;

  if v_target.email_confirmed_at is null then
    raise exception 'That account has not confirmed its email address yet.' using errcode = 'P0001';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_target.id;

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

revoke all on function public.grant_super_admin(text, text) from public, anon;
grant execute on function public.grant_super_admin(text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 2. BOOTSTRAP THE PRIMARY SUPER ADMIN — run ONCE, by hand.
--
--    Supersedes the §9 block in migration 0010, which could not match a fresh
--    operations account for the reason explained at the top of this file.
--
--    Replace the email if you use a different operations login. The account has
--    to exist in Supabase Auth already, with its email confirmed.
-- ============================================================================
--
-- insert into public.super_admins (user_id, email, full_name, is_primary, status, granted_at, note)
-- select u.id, u.email, u.raw_user_meta_data->>'full_name', true, 'active', now(), 'Bootstrap (SQL editor)'
--   from auth.users u
--  where lower(u.email) = lower('thakurishu458@gmail.com')
--    and u.email_confirmed_at is not null
--    -- separation: a real worker/retailer always has one of these records
--    and not exists (select 1 from public.workers w      where w.auth_user_id = u.id)
--    and not exists (select 1 from public.store_users su where su.auth_user_id = u.id)
-- on conflict (user_id) do update
--    set status = 'active', is_primary = true, revoked_at = null, revoked_by = null, updated_at = now()
-- returning user_id, email, is_primary, status;
--
-- -- `returning` above prints the row. If it prints NOTHING, the INSERT matched
-- -- nothing — check the email, and that the account is confirmed and has no
-- -- workers/store_users record.
--
-- insert into public.admin_audit_log (actor_user_id, actor_email, action, target_type, target_id, metadata)
-- select null, 'sql-editor', 'access.primary_bootstrapped', 'user', u.id::text, jsonb_build_object('email', u.email)
--   from auth.users u where lower(u.email) = lower('thakurishu458@gmail.com');
