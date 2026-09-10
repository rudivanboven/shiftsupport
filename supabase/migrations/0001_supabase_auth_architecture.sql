-- ============================================================================
--  ShiftSupport — Migration 0001
--  Memberstack  ->  Supabase Auth
--
--  SAFETY NOTES
--    * This migration is ADDITIVE ONLY.
--    * No table is dropped, no row is deleted, no column is removed.
--    * The legacy `memberstack_id` columns are KEPT and left populated.
--      They are only made NULLable so that new Supabase-Auth signups
--      (which have no Memberstack id) can be inserted.
--    * Safe to re-run: every statement is idempotent.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. PROFILES — the canonical identity + role record (1 row per auth user)
-- ============================================================================

alter table public.profiles
  add column if not exists email      text,
  add column if not exists phone      text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles alter column created_at set default now();

-- profiles.id IS the auth.users id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('worker', 'retailer', 'admin'));

-- ============================================================================
-- 2. WORKERS — link to auth.users, keep memberstack_id intact
-- ============================================================================

alter table public.workers
  add column if not exists auth_user_id uuid,
  add column if not exists email        text,
  add column if not exists updated_at   timestamptz not null default now();

alter table public.workers alter column created_at    set default now();
alter table public.workers alter column memberstack_id drop not null;   -- legacy data kept

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workers_auth_user_id_fkey'
      and conrelid = 'public.workers'::regclass
  ) then
    alter table public.workers
      add constraint workers_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists workers_auth_user_id_key
  on public.workers (auth_user_id) where auth_user_id is not null;

-- ============================================================================
-- 3. STORES
-- ============================================================================

alter table public.stores
  add column if not exists updated_at timestamptz not null default now();

alter table public.stores alter column created_at set default now();

-- ============================================================================
-- 4. STORE_USERS — link retailer auth users to their store
-- ============================================================================

alter table public.store_users
  add column if not exists auth_user_id uuid,
  add column if not exists updated_at   timestamptz not null default now();

alter table public.store_users alter column created_at set default now();
alter table public.store_users alter column role       set default 'owner';
alter table public.store_users alter column memberstack_id drop not null; -- legacy data kept

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_users_auth_user_id_fkey'
      and conrelid = 'public.store_users'::regclass
  ) then
    alter table public.store_users
      add constraint store_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists store_users_auth_user_id_key
  on public.store_users (auth_user_id) where auth_user_id is not null;

create index if not exists store_users_store_id_idx on public.store_users (store_id);

-- ============================================================================
-- 5. SHIFTS — extra descriptive fields used by the Post a Shift form
-- ============================================================================

alter table public.shifts
  add column if not exists description text,
  add column if not exists created_by  uuid,
  add column if not exists updated_at  timestamptz not null default now();

alter table public.shifts alter column created_at set default now();
alter table public.shifts alter column status     set default 'open';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shifts_created_by_fkey'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists shifts_store_id_idx    on public.shifts (store_id);
create index if not exists shifts_status_idx      on public.shifts (status);
create index if not exists shifts_accepted_by_idx on public.shifts (accepted_by);
create index if not exists shifts_start_time_idx  on public.shifts (start_time);

-- ============================================================================
-- 6. SHIFT_APPLICATIONS — one application per worker per shift
-- ============================================================================

alter table public.shift_applications alter column status     set default 'pending';
alter table public.shift_applications alter column applied_at set default now();

-- verified: no duplicates exist in the current data, so this cannot fail
create unique index if not exists shift_applications_shift_worker_key
  on public.shift_applications (shift_id, worker_id);

create index if not exists shift_applications_worker_id_idx on public.shift_applications (worker_id);
create index if not exists shift_applications_shift_id_idx  on public.shift_applications (shift_id);

-- ============================================================================
-- 7. NOTIFICATIONS — new table (database-backed, realtime-ready)
-- ============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  shift_id   uuid references public.shifts(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc);

-- ============================================================================
-- 8. HELPER FUNCTIONS
--    SECURITY DEFINER so that RLS policies can use them without recursing
--    back into the policies of the tables they read.
-- ============================================================================

create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_worker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.workers where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.store_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_users
    where store_id = p_store_id and auth_user_id = auth.uid()
  );
$$;

grant execute on function public.current_profile_role()          to authenticated;
grant execute on function public.current_worker_id()     to authenticated;
grant execute on function public.current_store_id()      to authenticated;
grant execute on function public.is_store_member(uuid)   to authenticated;

-- ============================================================================
-- 9. COLUMN-LEVEL PRIVACY FOR stores.contact_phone
--
--    RLS is row-level, so the store phone number is protected with COLUMN
--    privileges instead: no logged-in user can SELECT stores.contact_phone
--    directly. It is only readable through the two SECURITY DEFINER
--    functions below — one for the store's own owner, one for a worker who
--    has actually been hired for a shift at that store.
-- ============================================================================

revoke select on public.stores from authenticated, anon;

grant select (id, name, logo_url, address, lat, lon, created_at, updated_at)
  on public.stores to authenticated;

grant update on public.stores to authenticated;

-- The retailer's own store, including the contact phone.
create or replace function public.get_my_store()
returns table (
  id uuid, name text, address text, contact_phone text,
  logo_url text, created_at timestamp, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.address, s.contact_phone, s.logo_url, s.created_at, s.updated_at
  from public.stores s
  join public.store_users su on su.store_id = s.id
  where su.auth_user_id = auth.uid()
  limit 1;
$$;

-- Store contact details for ONE shift — only for the hired worker or the
-- store's own staff. Everybody else gets zero rows.
create or replace function public.get_shift_contact(p_shift_id uuid)
returns table (store_name text, store_address text, contact_phone text)
language sql stable security definer set search_path = public as $$
  select s.name, s.address, s.contact_phone
  from public.shifts sh
  join public.stores s on s.id = sh.store_id
  where sh.id = p_shift_id
    and (
      public.is_store_member(sh.store_id)
      or (sh.accepted_by is not null and sh.accepted_by = public.current_worker_id())
    );
$$;

grant execute on function public.get_my_store()            to authenticated;
grant execute on function public.get_shift_contact(uuid)   to authenticated;

-- ---------------------------------------------------------------------------
-- The mirror image: a worker's phone and email are protected the same way.
--
-- A retailer can see the NAME of everyone who applied (they need it to choose),
-- but the contact details only after they have actually hired that worker for
-- a shift. Again enforced with column privileges plus one definer function,
-- not just by what the UI happens to render.
-- ---------------------------------------------------------------------------

revoke select on public.workers from authenticated, anon;

grant select (id, auth_user_id, memberstack_id, full_name, created_at, updated_at)
  on public.workers to authenticated;

grant insert, update on public.workers to authenticated;

create or replace function public.get_shift_worker_contact(p_shift_id uuid)
returns table (worker_name text, phone text, email text)
language sql stable security definer set search_path = public as $$
  select w.full_name, w.phone, w.email
  from public.shifts sh
  join public.workers w on w.id = sh.accepted_by
  where sh.id = p_shift_id
    and public.is_store_member(sh.store_id);
$$;

grant execute on function public.get_shift_worker_contact(uuid) to authenticated;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.workers             enable row level security;
alter table public.stores              enable row level security;
alter table public.store_users         enable row level security;
alter table public.shifts              enable row level security;
alter table public.shift_applications  enable row level security;
alter table public.worker_availability enable row level security;
alter table public.shift_accepts       enable row level security;
alter table public.notifications       enable row level security;
alter table public.shiftsupport_shifts enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- a user may edit their profile but may NOT change their own role
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

-- ---------- workers ----------
drop policy if exists workers_select_own on public.workers;
create policy workers_select_own on public.workers
  for select to authenticated using (auth_user_id = auth.uid());

-- a retailer can see workers who applied to (or were hired for) their shifts
drop policy if exists workers_select_for_store on public.workers;
create policy workers_select_for_store on public.workers
  for select to authenticated using (
    exists (
      select 1
      from public.shift_applications sa
      join public.shifts s on s.id = sa.shift_id
      where sa.worker_id = workers.id and public.is_store_member(s.store_id)
    )
    or exists (
      select 1 from public.shifts s
      where s.accepted_by = workers.id and public.is_store_member(s.store_id)
    )
  );

drop policy if exists workers_insert_own on public.workers;
create policy workers_insert_own on public.workers
  for insert to authenticated with check (auth_user_id = auth.uid());

drop policy if exists workers_update_own on public.workers;
create policy workers_update_own on public.workers
  for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ---------- stores ----------
-- every signed-in user may read the public columns of a store (needed to show
-- the store name on a shift card); contact_phone is blocked at column level.
drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated on public.stores
  for select to authenticated using (true);

-- NOTE: no INSERT policy. Stores are created during retailer signup, which
-- runs server-side with the service-role key. Without a policy, a signed-in
-- user cannot create stray stores of their own.

drop policy if exists stores_update_own on public.stores;
create policy stores_update_own on public.stores
  for update to authenticated
  using (public.is_store_member(id)) with check (public.is_store_member(id));

-- ---------- store_users ----------
drop policy if exists store_users_select_own on public.store_users;
create policy store_users_select_own on public.store_users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_store_member(store_id));

drop policy if exists store_users_insert_own on public.store_users;
create policy store_users_insert_own on public.store_users
  for insert to authenticated with check (auth_user_id = auth.uid());

drop policy if exists store_users_update_own on public.store_users;
create policy store_users_update_own on public.store_users
  for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ---------- shifts ----------
-- visible if: it's my store's shift, OR I'm the hired worker, OR I applied,
-- OR it is genuinely still open to applications.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select to authenticated using (
    public.is_store_member(store_id)
    or (accepted_by is not null and accepted_by = public.current_worker_id())
    or exists (
      select 1 from public.shift_applications sa
      where sa.shift_id = shifts.id and sa.worker_id = public.current_worker_id()
    )
    or (status = 'open' and accepted_by is null)
  );

drop policy if exists shifts_insert_own_store on public.shifts;
create policy shifts_insert_own_store on public.shifts
  for insert to authenticated with check (public.is_store_member(store_id));

drop policy if exists shifts_update_own_store on public.shifts;
create policy shifts_update_own_store on public.shifts
  for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

drop policy if exists shifts_delete_own_store on public.shifts;
create policy shifts_delete_own_store on public.shifts
  for delete to authenticated using (public.is_store_member(store_id));

-- ---------- shift_applications ----------
drop policy if exists shift_applications_select on public.shift_applications;
create policy shift_applications_select on public.shift_applications
  for select to authenticated using (
    worker_id = public.current_worker_id()
    or exists (
      select 1 from public.shifts s
      where s.id = shift_applications.shift_id and public.is_store_member(s.store_id)
    )
  );

-- a worker may only apply as themselves, only to a genuinely open shift,
-- and only with status 'pending'. The unique index blocks a second attempt.
drop policy if exists shift_applications_insert_own on public.shift_applications;
create policy shift_applications_insert_own on public.shift_applications
  for insert to authenticated with check (
    worker_id = public.current_worker_id()
    and status = 'pending'
    and exists (
      select 1 from public.shifts s
      where s.id = shift_id and s.status = 'open' and s.accepted_by is null
    )
  );

-- NOTE: deliberately no UPDATE policy for workers — a worker cannot approve
-- their own application. Hiring/rejecting happens through the RPCs in §11,
-- which verify store ownership.
drop policy if exists shift_applications_update_store on public.shift_applications;
create policy shift_applications_update_store on public.shift_applications
  for update to authenticated
  using (
    exists (select 1 from public.shifts s
            where s.id = shift_applications.shift_id and public.is_store_member(s.store_id))
  )
  with check (
    exists (select 1 from public.shifts s
            where s.id = shift_applications.shift_id and public.is_store_member(s.store_id))
  );

-- a worker may withdraw an application that has not been reviewed yet
drop policy if exists shift_applications_delete_own on public.shift_applications;
create policy shift_applications_delete_own on public.shift_applications
  for delete to authenticated
  using (worker_id = public.current_worker_id() and status = 'pending');

-- ---------- worker_availability ----------
drop policy if exists worker_availability_own on public.worker_availability;
create policy worker_availability_own on public.worker_availability
  for all to authenticated
  using (worker_id = public.current_worker_id())
  with check (worker_id = public.current_worker_id());

-- ---------- shift_accepts (legacy audit trail) ----------
drop policy if exists shift_accepts_select on public.shift_accepts;
create policy shift_accepts_select on public.shift_accepts
  for select to authenticated using (
    worker_id = public.current_worker_id()
    or exists (select 1 from public.shifts s
               where s.id = shift_accepts.shift_id and public.is_store_member(s.store_id))
  );

-- ---------- notifications ----------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;

-- ---------- shiftsupport_shifts (legacy marketing form intake) ----------
-- RLS on with no policy for authenticated/anon = fully locked down.
-- The service-role key still has access, so nothing that reads it breaks.

commit;

-- Tell PostgREST to pick up the new columns/functions immediately.
notify pgrst, 'reload schema';
