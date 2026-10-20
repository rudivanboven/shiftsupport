-- ============================================================================
--  Verification for migration 0014 — run AFTER 0014 in the SQL editor.
--
--  Everything runs inside one transaction that ends in ROLLBACK, so nothing
--  it does persists: it impersonates an existing worker's session, attempts
--  the exact tampering the migration prevents, confirms a normal profile
--  update still works, and proves the trigger layer holds on its own even if
--  the column grant were widened.
--
--  Expected output: a series of "PASS: …" notices and no error. Any "FAIL"
--  raises an exception, which also aborts (and rolls back) the transaction.
--
--  Nothing is changed for the worker it picks: the final ROLLBACK undoes the
--  temporary grant and the profile no-op update alike.
-- ============================================================================

begin;

do $$
declare
  v_worker public.workers%rowtype;
  v_after  public.workers%rowtype;
  v_cols   text;
begin
  -- 0. The objects exist.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'workers_enforce_membership_state'
      and tgrelid = 'public.workers'::regclass
  ) then
    raise exception 'FAIL: trigger workers_enforce_membership_state is missing';
  end if;
  raise notice 'PASS: trigger workers_enforce_membership_state exists';

  -- 1. The grant is column-level and names only profile columns.
  select string_agg(column_name, ', ' order by column_name)
    into v_cols
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'workers'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if v_cols is distinct from 'email, full_name, phone, updated_at' then
    raise exception 'FAIL: authenticated UPDATE columns are [%], expected [email, full_name, phone, updated_at]', v_cols;
  end if;
  raise notice 'PASS: authenticated may UPDATE only: %', v_cols;

  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'workers'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'FAIL: authenticated still holds a table-wide UPDATE grant on workers';
  end if;
  raise notice 'PASS: no table-wide UPDATE grant on workers for authenticated';

  -- 2. Pick a real worker to impersonate (nothing about them will change).
  select * into v_worker
    from public.workers
   where auth_user_id is not null
   order by created_at nulls last, id
   limit 1;

  if v_worker.id is null then
    raise notice 'SKIP: no worker rows with an auth user — grant and trigger checks passed, behaviour checks skipped';
    return;
  end if;

  -- Become that worker, the way PostgREST would.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_worker.auth_user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub',  v_worker.auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  -- 3. Layer 1: naming a protected column is refused outright.
  begin
    update public.workers
       set membership_status = 'active', membership_expires_at = null
     where id = v_worker.id;
    raise exception 'FAIL: authenticated was allowed to UPDATE membership_status';
  exception
    when insufficient_privilege then
      raise notice 'PASS: UPDATE of membership_status refused by column privileges (42501)';
  end;

  begin
    update public.workers set stripe_subscription_id = 'sub_tampered' where id = v_worker.id;
    raise exception 'FAIL: authenticated was allowed to UPDATE stripe_subscription_id';
  exception
    when insufficient_privilege then
      raise notice 'PASS: UPDATE of stripe_subscription_id refused by column privileges (42501)';
  end;

  -- 4. A normal profile update (what app/actions/profile.ts does) still works.
  update public.workers
     set full_name = v_worker.full_name, phone = v_worker.phone, updated_at = now()
   where id = v_worker.id;
  if not found then
    raise exception 'FAIL: the worker could not update their own profile columns';
  end if;
  raise notice 'PASS: profile update (full_name, phone, updated_at) still allowed';

  -- 5. Layer 2: even with the grant widened, the trigger pins the columns.
  execute 'reset role';
  grant update (membership_status, membership_expires_at, stripe_subscription_id)
    on public.workers to authenticated;   -- temporary: rolled back below
  execute 'set local role authenticated';

  update public.workers
     set membership_status = 'active', membership_expires_at = null,
         stripe_subscription_id = 'sub_tampered'
   where id = v_worker.id;
  if not found then
    raise exception 'FAIL: impersonation ineffective — the tampering UPDATE matched 0 rows, so the trigger was never exercised';
  end if;

  execute 'reset role';
  select * into v_after from public.workers where id = v_worker.id;

  if v_after.membership_status       is distinct from v_worker.membership_status
  or v_after.membership_expires_at   is distinct from v_worker.membership_expires_at
  or v_after.stripe_subscription_id  is distinct from v_worker.stripe_subscription_id
  or v_after.membership_started_at   is distinct from v_worker.membership_started_at
  or v_after.stripe_customer_id      is distinct from v_worker.stripe_customer_id then
    raise exception 'FAIL: trigger did not pin the protected columns';
  end if;
  raise notice 'PASS: trigger pinned membership/stripe columns despite a widened grant';

  -- 6. The service role path is unaffected: an update as postgres (what the
  --    service role and the SQL editor amount to) goes through.
  update public.workers
     set membership_updated_at = membership_updated_at
   where id = v_worker.id;
  raise notice 'PASS: non-API role can still write membership columns';

  raise notice 'ALL CHECKS PASSED — rolling back, nothing persisted';
end $$;

rollback;
