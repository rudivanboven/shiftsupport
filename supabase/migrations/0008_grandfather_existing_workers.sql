-- ============================================================================
--  ShiftSupport — Migration 0008
--  One-time backfill: keep the workers who joined before memberships existed.
--
--  Run AFTER 0007. Business decision: workers who already had accounts when
--  Stripe memberships were introduced keep marketplace access without paying.
--
--  Deliberately a separate migration rather than part of 0007, so re-running
--  the schema migration can never re-activate a membership that has since
--  lapsed. The guards below make this file safe to re-run too:
--
--    * `stripe_customer_id is null` — nobody who has ever been through Stripe
--      checkout is touched, so a genuine cancellation stays cancelled.
--    * `membership_status = 'inactive'` — never overwrites active/past_due.
--    * `created_at < '2026-09-12'` — only accounts that predate the rollout.
--      Workers who sign up after this date pay like everyone else.
--
--  Effect: `membership_status = 'active'` with no expiry date, which
--  `membership_grants_access()` treats as access that does not run out. A
--  Stripe subscription event for that worker replaces it later.
-- ============================================================================

begin;

update public.workers
   set membership_status     = 'active',
       membership_started_at = coalesce(membership_started_at, created_at, now()),
       membership_expires_at = null,
       membership_updated_at = now()
 where membership_status = 'inactive'
   and stripe_customer_id is null
   and coalesce(created_at, now()) < timestamptz '2026-09-12 00:00:00+00';

-- How many workers were grandfathered in (shown in the SQL editor output).
select count(*) as grandfathered_workers
  from public.workers
 where membership_status = 'active'
   and stripe_subscription_id is null;

commit;

-- ----------------------------------------------------------------------------
-- ALTERNATIVE — a grace period instead of open-ended access.
-- Use this INSTEAD of the statement above if existing workers should keep
-- access only until a cut-off date, after which they subscribe like everyone
-- else. Adjust the date before running.
-- ----------------------------------------------------------------------------
--
-- update public.workers
--    set membership_status     = 'active',
--        membership_started_at = coalesce(membership_started_at, created_at, now()),
--        membership_expires_at = timestamptz '2027-01-01 00:00:00+00',
--        membership_updated_at = now()
--  where membership_status = 'inactive'
--    and stripe_customer_id is null
--    and coalesce(created_at, now()) < timestamptz '2026-09-12 00:00:00+00';
