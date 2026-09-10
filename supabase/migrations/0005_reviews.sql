-- ============================================================================
--  ShiftSupport — Migration 0005
--  Two-way reviews: retailer <-> worker, unlocked 3 days after completion
--
--  SAFETY NOTES
--    * ADDITIVE ONLY. No table is dropped, no column removed, no row deleted.
--    * Safe to re-run: every statement is idempotent.
--    * RLS stays ON everywhere. No policy added here reads `reviews` from
--      inside another `reviews` policy, so no recursion is possible.
--
--  Run this in:  Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

begin;

-- ============================================================================
-- 1. SHIFT COMPLETION — shifts.completed_at
--
--    A shift is only "completed" when the store says so (see complete_shift
--    below). A past end_time is NOT completion: the retailer still has to
--    confirm the shift actually happened, which is what starts the review
--    clock. completed_at is that clock's zero point.
-- ============================================================================

alter table public.shifts
  add column if not exists completed_at timestamptz;

create index if not exists shifts_completed_at_idx
  on public.shifts (completed_at);

-- Any shift already flagged completed before this migration gets a sensible
-- zero point rather than staying un-reviewable forever.
update public.shifts
set completed_at = end_time
where status = 'completed'
  and completed_at is null;

-- ============================================================================
-- 2. REVIEWS TABLE
-- ============================================================================

create table if not exists public.reviews (
  id                uuid primary key default gen_random_uuid(),
  shift_id          uuid not null references public.shifts(id)  on delete cascade,
  reviewer_user_id  uuid not null references auth.users(id)     on delete cascade,
  reviewee_user_id  uuid not null references auth.users(id)     on delete cascade,
  reviewer_role     text not null,
  reviewee_role     text not null,
  rating            integer not null,
  comment           text,
  created_at        timestamptz not null default now()
);

-- Constraints added separately so re-running against an existing table works.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_range') then
    alter table public.reviews add constraint reviews_rating_range
      check (rating between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reviews_reviewer_role_valid') then
    alter table public.reviews add constraint reviews_reviewer_role_valid
      check (reviewer_role in ('worker', 'retailer'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reviews_reviewee_role_valid') then
    alter table public.reviews add constraint reviews_reviewee_role_valid
      check (reviewee_role in ('worker', 'retailer'));
  end if;

  -- A review always points across the two sides, never at the same side.
  if not exists (select 1 from pg_constraint where conname = 'reviews_direction_valid') then
    alter table public.reviews add constraint reviews_direction_valid
      check (reviewer_role <> reviewee_role);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reviews_no_self_review') then
    alter table public.reviews add constraint reviews_no_self_review
      check (reviewer_user_id <> reviewee_user_id);
  end if;
end $$;

-- THE duplicate rule: one retailer->worker review and one worker->retailer
-- review per shift, enforced by the database rather than by the UI.
create unique index if not exists reviews_shift_direction_key
  on public.reviews (shift_id, reviewer_role);

create index if not exists reviews_reviewee_idx on public.reviews (reviewee_user_id);
create index if not exists reviews_shift_idx    on public.reviews (shift_id);

-- ============================================================================
-- 3. THE WAITING PERIOD
--
--    One definition, used by the write path, the read path and the UI, so the
--    button and the check behind it can never drift apart.
-- ============================================================================

create or replace function public.review_delay()
returns interval language sql immutable as $$
  select interval '3 days';
$$;

-- ============================================================================
-- 4. HELPERS
--    SECURITY DEFINER so policies can call them without recursing into the
--    policies of the tables they read.
-- ============================================================================

create or replace function public.is_shift_store_member(p_shift_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.shifts s
    join public.store_users su on su.store_id = s.store_id
    where s.id = p_shift_id and su.auth_user_id = auth.uid()
  );
$$;

-- The auth user of the worker hired for a shift (null when nobody was hired).
create or replace function public.shift_hired_auth_user(p_shift_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select w.auth_user_id
  from public.shifts s
  join public.workers w on w.id = s.accepted_by
  where s.id = p_shift_id;
$$;

-- ============================================================================
-- 5. COMPLETING A SHIFT
--
--    Only the store that posted it, only once a worker was actually hired,
--    and only after the shift has finished. Idempotent: completing twice
--    keeps the original completed_at, so nobody can restart the review clock.
-- ============================================================================

create or replace function public.complete_shift(p_shift_id uuid)
returns public.shifts
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_worker_uid uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if not public.is_shift_store_member(p_shift_id) then
    raise exception 'Only the store that posted this shift can complete it.'
      using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  -- Already done: return as-is so a double click is harmless.
  if v_shift.status = 'completed' and v_shift.completed_at is not null then
    return v_shift;
  end if;

  if v_shift.status = 'cancelled' then
    raise exception 'A cancelled shift cannot be completed.' using errcode = 'P0001';
  end if;

  if v_shift.accepted_by is null then
    raise exception 'Nobody was hired for this shift, so there is nothing to complete.'
      using errcode = 'P0001';
  end if;

  if v_shift.end_time::timestamptz > now() then
    raise exception 'This shift has not finished yet.' using errcode = 'P0001';
  end if;

  update public.shifts
  set status       = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at   = now()
  where id = p_shift_id
  returning * into v_shift;

  -- Tell the worker their shift is confirmed and when they can review it.
  select public.shift_hired_auth_user(p_shift_id) into v_worker_uid;
  if v_worker_uid is not null then
    insert into public.notifications (user_id, type, title, body, shift_id)
    values (
      v_worker_uid,
      'shift_completed',
      'Shift confirmed as completed',
      'You can leave a review for this store from '
        || to_char(v_shift.completed_at + public.review_delay(), 'DD Mon YYYY') || '.',
      p_shift_id
    );
  end if;

  return v_shift;
end $$;

-- ============================================================================
-- 6. SUBMITTING A REVIEW
--
--    The ONLY way a row reaches `reviews` (the table has no INSERT policy).
--    Everything the client could lie about — who is reviewing, who is being
--    reviewed, which direction, whether the window is open — is decided here
--    from auth.uid() and the shift's own data. The caller supplies nothing but
--    a shift id, a rating and a comment.
-- ============================================================================

create or replace function public.submit_review(
  p_shift_id uuid,
  p_rating   integer,
  p_comment  text default null
)
returns public.reviews
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_shift      public.shifts;
  v_worker_uid uuid;
  v_is_store   boolean;
  v_opens_at   timestamptz;
  v_reviewer   text;
  v_reviewee   text;
  v_target     uuid;
  v_review     public.reviews;
begin
  -- 1. authenticated
  if v_uid is null then
    raise exception 'You must be signed in to leave a review.' using errcode = '42501';
  end if;

  -- 2. valid rating
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating between 1 and 5 stars.' using errcode = '22023';
  end if;

  -- 3. real shift
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift no longer exists.' using errcode = 'P0002';
  end if;

  -- 4. genuinely completed
  if v_shift.status <> 'completed' or v_shift.completed_at is null then
    raise exception 'This shift has not been marked completed yet.' using errcode = 'P0001';
  end if;

  -- 5. waiting period elapsed — measured against the database clock, never
  --    against anything the browser sent.
  v_opens_at := v_shift.completed_at + public.review_delay();
  if now() < v_opens_at then
    raise exception 'Reviews for this shift open on %.',
      to_char(v_opens_at, 'DD Mon YYYY') using errcode = 'P0001';
  end if;

  -- 6. participant, and which side they are on
  v_is_store   := public.is_shift_store_member(p_shift_id);
  v_worker_uid := public.shift_hired_auth_user(p_shift_id);

  if v_is_store then
    v_reviewer := 'retailer';
    v_reviewee := 'worker';
    v_target   := v_worker_uid;
    if v_target is null then
      raise exception 'No worker was hired for this shift.' using errcode = 'P0001';
    end if;

  elsif v_worker_uid is not null and v_worker_uid = v_uid then
    v_reviewer := 'worker';
    v_reviewee := 'retailer';
    -- The store's owner is the account that carries the store's reputation.
    select su.auth_user_id into v_target
    from public.store_users su
    where su.store_id = v_shift.store_id
      and su.auth_user_id is not null
    order by case when su.role = 'owner' then 0 else 1 end, su.created_at
    limit 1;

    if v_target is null then
      raise exception 'This store has no account to review.' using errcode = 'P0001';
    end if;

  else
    raise exception 'Only the people involved in this shift can review it.'
      using errcode = '42501';
  end if;

  -- 7. insert (the unique index is what actually blocks a second review)
  begin
    insert into public.reviews (
      shift_id, reviewer_user_id, reviewee_user_id,
      reviewer_role, reviewee_role, rating, comment
    )
    values (
      p_shift_id, v_uid, v_target,
      v_reviewer, v_reviewee, p_rating,
      nullif(btrim(coalesce(p_comment, '')), '')
    )
    returning * into v_review;
  exception
    when unique_violation then
      raise exception 'You have already reviewed this shift.' using errcode = '23505';
  end;

  insert into public.notifications (user_id, type, title, body, shift_id)
  values (
    v_target,
    'review_received',
    'You have a new review',
    'Someone you worked with left you a ' || p_rating || '-star review.',
    p_shift_id
  );

  return v_review;
end $$;

-- ============================================================================
-- 7. READING REVIEW STATE
--
--    One call answers, for a batch of shifts: is the window open, when does
--    it open, which side am I, have I already reviewed. `can_review` is
--    computed with the database's now() — the UI renders it, it does not
--    decide it.
-- ============================================================================

create or replace function public.get_shift_review_state(p_shift_ids uuid[])
returns table (
  shift_id             uuid,
  shift_status         text,
  completed_at         timestamptz,
  review_opens_at      timestamptz,
  can_review           boolean,
  viewer_role          text,
  my_rating            integer,
  my_comment           text,
  my_review_created_at timestamptz,
  received_rating      integer
)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select
      s.id,
      s.status,
      s.completed_at,
      public.is_shift_store_member(s.id)   as is_store,
      public.shift_hired_auth_user(s.id)   as worker_uid
    from public.shifts s
    where s.id = any(coalesce(p_shift_ids, '{}'::uuid[]))
  ),
  visible as (
    -- Participants only: a shift id the caller is not part of returns no row.
    select *,
      case when is_store then 'retailer'
           when worker_uid = auth.uid() then 'worker' end as viewer_role
    from scoped
    where is_store or worker_uid = auth.uid()
  )
  select
    v.id,
    v.status,
    v.completed_at,
    v.completed_at + public.review_delay(),
    (
      v.status = 'completed'
      and v.completed_at is not null
      and now() >= v.completed_at + public.review_delay()
      and mine.id is null
    ),
    v.viewer_role,
    mine.rating,
    mine.comment,
    mine.created_at,
    theirs.rating
  from visible v
  left join public.reviews mine
    on mine.shift_id = v.id and mine.reviewer_user_id = auth.uid()
  left join public.reviews theirs
    on theirs.shift_id = v.id and theirs.reviewee_user_id = auth.uid();
$$;

-- ============================================================================
-- 8. RATING AGGREGATES
--    Averaged over real reviews in the correct direction only.
-- ============================================================================

create or replace function public.worker_rating(p_worker_id uuid)
returns table (average numeric, total integer)
language sql stable security definer set search_path = public as $$
  select
    case when count(*) = 0 then null
         else round(avg(r.rating)::numeric, 2) end,
    count(*)::int
  from public.reviews r
  join public.workers w on w.auth_user_id = r.reviewee_user_id
  where w.id = p_worker_id
    and r.reviewer_role = 'retailer'
    and r.reviewee_role = 'worker';
$$;

create or replace function public.store_rating(p_store_id uuid)
returns table (average numeric, total integer)
language sql stable security definer set search_path = public as $$
  select
    case when count(*) = 0 then null
         else round(avg(r.rating)::numeric, 2) end,
    count(*)::int
  from public.reviews r
  join public.shifts s on s.id = r.shift_id
  where s.store_id = p_store_id
    and r.reviewer_role = 'worker'
    and r.reviewee_role = 'retailer';
$$;

-- ============================================================================
-- 9. REVIEW HISTORY (per job)
-- ============================================================================

-- Reviews written ABOUT a worker. Readable by that worker, and by a store
-- that actually hired them — nobody else, and never with the reviewer's
-- contact details attached.
create or replace function public.get_worker_reviews(p_worker_id uuid)
returns table (
  id          uuid,
  rating      integer,
  comment     text,
  created_at  timestamptz,
  shift_id    uuid,
  task_type   text,
  shift_date  timestamptz,
  store_name  text
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.rating, r.comment, r.created_at,
    s.id, s.task_type, s.start_time::timestamptz, st.name
  from public.reviews r
  join public.shifts s  on s.id = r.shift_id
  join public.stores st on st.id = s.store_id
  join public.workers w on w.auth_user_id = r.reviewee_user_id
  where w.id = p_worker_id
    and r.reviewer_role = 'retailer'
    and (
      w.auth_user_id = auth.uid()
      or exists (
        select 1
        from public.shifts s2
        join public.store_users su on su.store_id = s2.store_id
        where s2.accepted_by = p_worker_id and su.auth_user_id = auth.uid()
      )
    )
  order by r.created_at desc;
$$;

-- Reviews workers left about a store. Readable by that store's own staff.
create or replace function public.get_store_reviews(p_store_id uuid)
returns table (
  id          uuid,
  rating      integer,
  comment     text,
  created_at  timestamptz,
  shift_id    uuid,
  task_type   text,
  shift_date  timestamptz,
  worker_name text
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.rating, r.comment, r.created_at,
    s.id, s.task_type, s.start_time::timestamptz, w.full_name
  from public.reviews r
  join public.shifts s   on s.id = r.shift_id
  left join public.workers w on w.id = s.accepted_by
  where s.store_id = p_store_id
    and r.reviewer_role = 'worker'
    and exists (
      select 1 from public.store_users su
      where su.store_id = p_store_id and su.auth_user_id = auth.uid()
    )
  order by r.created_at desc;
$$;

-- ============================================================================
-- 10. TOP RATED WORKERS
--     Ordered by average, then by how many reviews back that average up, so a
--     single 5-star review does not outrank a long strong history.
--     Retailer-only: this is a hiring aid, not a public leaderboard.
-- ============================================================================

create or replace function public.get_top_rated_workers(p_limit integer default 10)
returns table (
  worker_id uuid,
  full_name text,
  average   numeric,
  total     integer
)
language sql stable security definer set search_path = public as $$
  select
    w.id,
    w.full_name,
    round(avg(r.rating)::numeric, 2),
    count(*)::int
  from public.reviews r
  join public.workers w on w.auth_user_id = r.reviewee_user_id
  where r.reviewer_role = 'retailer'
    and public.current_profile_role() = 'retailer'
  group by w.id, w.full_name
  order by round(avg(r.rating)::numeric, 2) desc, count(*) desc, w.full_name
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ============================================================================
-- 11. ROW LEVEL SECURITY
--
--    SELECT: the two people in the review, plus the store that ran the shift.
--    INSERT: no policy at all — submit_review() (SECURITY DEFINER) is the only
--            way in, which is what makes reviewer_user_id unfakeable.
--    UPDATE/DELETE: no policy — a submitted review is permanent (v1 rule).
-- ============================================================================

alter table public.reviews enable row level security;

drop policy if exists reviews_select_participants on public.reviews;
create policy reviews_select_participants on public.reviews
  for select to authenticated using (
    reviewer_user_id = auth.uid()
    or reviewee_user_id = auth.uid()
    or public.is_shift_store_member(shift_id)
  );

grant select on public.reviews to authenticated;
revoke insert, update, delete on public.reviews from authenticated;

grant execute on function public.review_delay()                       to authenticated;
grant execute on function public.is_shift_store_member(uuid)          to authenticated;
grant execute on function public.shift_hired_auth_user(uuid)          to authenticated;
grant execute on function public.complete_shift(uuid)                 to authenticated;
grant execute on function public.submit_review(uuid, integer, text)   to authenticated;
grant execute on function public.get_shift_review_state(uuid[])       to authenticated;
grant execute on function public.worker_rating(uuid)                  to authenticated;
grant execute on function public.store_rating(uuid)                   to authenticated;
grant execute on function public.get_worker_reviews(uuid)             to authenticated;
grant execute on function public.get_store_reviews(uuid)              to authenticated;
grant execute on function public.get_top_rated_workers(integer)       to authenticated;

commit;

notify pgrst, 'reload schema';
