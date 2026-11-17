-- ============================================================================
-- ShiftSupport — Migration 0017
-- One-time retailer reminder rollout reset.
--
-- Existing active retailer schedules get a fresh first-reminder due time of
-- exactly 14 days after this migration transaction starts. Historical signup
-- and reminder fields are preserved. Posted/stopped schedules are untouched.
-- A marker row makes the reset one-time even if this SQL is accidentally
-- re-run. No email is sent by this migration.
-- ============================================================================

begin;

create table if not exists public.email_workflow_migration_markers (
  marker text primary key,
  applied_at timestamptz not null default now()
);

alter table public.email_workflow_migration_markers enable row level security;
revoke all on public.email_workflow_migration_markers from public, anon, authenticated;

do $$
declare
  v_rollout_timestamp timestamptz := transaction_timestamp();
  v_first_application boolean := false;
begin
  insert into public.email_workflow_migration_markers (marker, applied_at)
  values ('0017_reset_retailer_reminder_rollout', v_rollout_timestamp)
  on conflict (marker) do nothing
  returning true into v_first_application;

  if coalesce(v_first_application, false) then
    update public.retailer_onboarding_reminders
       set next_reminder_due_at = v_rollout_timestamp + interval '14 days'
     where first_shift_posted_at is null
       and stopped_at is null;
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
