-- ============================================================================
--  ShiftSupport — Migration 0018
--  1. Remove Stripe payment requirement from shift creation & publishing while
--     preserving all historical payment tables and records (`shift_payments`,
--     `worker_signup_payments`, `stripe_events`).
--  2. Add Retailer Invoice management (`retailer_invoices`,
--     `retailer_invoice_email_logs`, sequence, private storage bucket
--     `retailer-invoices`, and Super Admin RLS policies).
--
--  SAFETY NOTES
--    * ADDITIVE & NON-DESTRUCTIVE. No historical payment table, column, or row
--      is dropped or deleted.
--    * Shifts created from a retailer session now publish directly as
--      `status = 'open'` without requiring a Stripe Checkout payment.
--    * Workers in Free Mode and active members can view and apply to open
--      shifts regardless of `payment_status`.
--    * Safe to re-run: every statement is idempotent.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. SHIFTS — Publish directly without Stripe payment gate
--    Historical payment columns (`payment_status`, `amount_paid_cents`,
--    `paid_at`) remain intact for past records, while new shifts default to
--    `status = 'open'` and `published_at = now()`.
-- ============================================================================

create or replace function public.enforce_shift_payment_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Shifts no longer go through Stripe checkout: publish directly as 'open'
    -- unless explicitly created in another valid non-paid state.
    new.payment_status    := coalesce(nullif(new.payment_status, ''), 'legacy');
    new.amount_paid_cents := null;
    new.paid_at           := null;
    if coalesce(new.status, '') in ('', 'draft', 'open') then
      new.status       := 'open';
      new.published_at := coalesce(new.published_at, now());
    end if;
    return new;
  end if;

  -- Preserve historical payment columns on updates from browser sessions.
  new.payment_status    := old.payment_status;
  new.amount_paid_cents := old.amount_paid_cents;
  new.paid_at           := old.paid_at;
  new.published_at      := coalesce(old.published_at, case when new.status = 'open' then now() else null end);

  return new;
end;
$$;

-- Open shifts are visible in the marketplace without requiring a Stripe payment.
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
    )
  );

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

revoke all on function public.worker_can_apply_to_shift(uuid) from public, anon;
grant execute on function public.worker_can_apply_to_shift(uuid) to authenticated;

create or replace function public.worker_can_view_series(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.shifts s
     where s.series_id = p_series_id
       and (
         (s.accepted_by is not null and s.accepted_by = public.current_worker_id())
         or public.worker_has_applied_to_shift(s.id)
         or (
           s.status = 'open'
           and s.accepted_by is null
         )
       )
  );
$$;

revoke all on function public.worker_can_view_series(uuid) from public, anon;
grant execute on function public.worker_can_view_series(uuid) to authenticated;

create or replace function public.apply_for_shift_free_mode(
  p_worker_id uuid,
  p_shift_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
begin
  if not exists (
    select 1 from public.workers w where w.id = p_worker_id
  ) then
    raise exception 'Worker profile not found.' using errcode = 'P0002';
  end if;

  perform 1 from public.shifts s where s.id = p_shift_id for update;
  if not found then
    raise exception 'That shift is no longer available.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.shifts s
    where s.id = p_shift_id
      and s.status = 'open'
      and s.accepted_by is null
  ) then
    raise exception 'This shift is no longer open for applications.' using errcode = 'P0001';
  end if;

  insert into public.shift_applications (shift_id, worker_id, status)
  values (p_shift_id, p_worker_id, 'pending')
  returning id into v_application_id;

  return v_application_id;
end;
$$;

revoke all on function public.apply_for_shift_free_mode(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_for_shift_free_mode(uuid, uuid)
  to service_role;

-- ============================================================================
-- 2. RETAILER INVOICES — Super Admin Invoice Generation & Tracking
-- ============================================================================

create sequence if not exists public.retailer_invoice_number_seq start with 1001;

create table if not exists public.retailer_invoices (
  id                       uuid primary key default gen_random_uuid(),
  invoice_number           text not null,
  shift_id                 uuid not null references public.shifts(id) on delete restrict,
  store_id                 uuid not null references public.stores(id) on delete restrict,
  retailer_user_id         uuid references auth.users(id) on delete set null,
  worker_id                uuid references public.workers(id) on delete set null,
  time_entry_id            uuid references public.shift_time_entries(id) on delete set null,

  -- Snapshot of Retailer & Store billing details at invoice creation time
  retailer_name            text not null,
  store_name               text not null,
  store_address            text,
  contact_person_name      text,
  contact_phone            text,
  contact_email            text,

  -- Snapshot of Shift & Pricing calculation details
  shift_task_type          text not null,
  shift_location           text,
  shift_date               date not null,
  shift_start_time         timestamp not null,
  shift_end_time           timestamp not null,
  approved_hours           numeric(6,2) not null,
  hourly_rate              numeric(8,2) not null,
  subtotal_cents           integer not null,
  tax_cents                integer not null default 0,
  total_cents              integer not null,
  currency                 text not null default 'USD',

  -- Line items JSON snapshot (supports single or multiple workers per shift)
  line_items               jsonb not null default '[]'::jsonb,

  -- Private PDF storage reference
  pdf_storage_bucket       text not null default 'retailer-invoices',
  pdf_storage_path         text not null,
  pdf_size_bytes           integer,
  pdf_sha256               text,

  -- Invoice & Email delivery lifecycle
  invoice_status           text not null default 'generated',
  email_status             text not null default 'not_sent',
  email_sent_at            timestamptz,
  email_send_count         integer not null default 0,
  last_emailed_to          text,
  email_provider           text,
  email_provider_message_id text,
  email_last_error         text,

  created_by               uuid references auth.users(id) on delete set null,
  issued_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_invoices_status_check'
      and conrelid = 'public.retailer_invoices'::regclass
  ) then
    alter table public.retailer_invoices
      add constraint retailer_invoices_status_check
      check (invoice_status in ('generated', 'sent', 'paid', 'void'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_invoices_email_status_check'
      and conrelid = 'public.retailer_invoices'::regclass
  ) then
    alter table public.retailer_invoices
      add constraint retailer_invoices_email_status_check
      check (email_status in ('not_sent', 'sent', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_invoices_amounts_check'
      and conrelid = 'public.retailer_invoices'::regclass
  ) then
    alter table public.retailer_invoices
      add constraint retailer_invoices_amounts_check
      check (
        approved_hours > 0
        and hourly_rate > 0
        and subtotal_cents > 0
        and tax_cents >= 0
        and total_cents = subtotal_cents + tax_cents
      );
  end if;
end $$;

-- Duplicate prevention: at most one invoice per shift, and unique invoice numbers.
create unique index if not exists retailer_invoices_shift_id_key
  on public.retailer_invoices (shift_id);

create unique index if not exists retailer_invoices_invoice_number_key
  on public.retailer_invoices (invoice_number);

create index if not exists retailer_invoices_store_id_idx
  on public.retailer_invoices (store_id, created_at desc);

create index if not exists retailer_invoices_created_at_idx
  on public.retailer_invoices (created_at desc);

create or replace function public.set_retailer_invoices_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists retailer_invoices_set_updated_at on public.retailer_invoices;
create trigger retailer_invoices_set_updated_at
  before update on public.retailer_invoices
  for each row execute function public.set_retailer_invoices_updated_at();

-- Email delivery history log for initial sends and resends
create table if not exists public.retailer_invoice_email_logs (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.retailer_invoices(id) on delete cascade,
  invoice_number       text not null,
  recipient_email      text not null,
  subject              text not null,
  status               text not null,
  provider             text,
  provider_message_id  text,
  error                text,
  sent_by              uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_invoice_email_logs_status_check'
      and conrelid = 'public.retailer_invoice_email_logs'::regclass
  ) then
    alter table public.retailer_invoice_email_logs
      add constraint retailer_invoice_email_logs_status_check
      check (status in ('sent', 'failed'));
  end if;
end $$;

create index if not exists retailer_invoice_email_logs_invoice_idx
  on public.retailer_invoice_email_logs (invoice_id, created_at desc);

-- ============================================================================
-- 3. ROW LEVEL SECURITY — Super Admin Only
--    Retailers and Workers cannot query, generate, modify, or download other
--    stores' invoices; all management actions run server-side after verifying
--    `is_super_admin()`.
-- ============================================================================

alter table public.retailer_invoices enable row level security;
revoke all on public.retailer_invoices from public, anon, authenticated;
grant select on public.retailer_invoices to authenticated;

drop policy if exists retailer_invoices_select_super_admin on public.retailer_invoices;
create policy retailer_invoices_select_super_admin on public.retailer_invoices
  for select to authenticated
  using (public.is_super_admin());

alter table public.retailer_invoice_email_logs enable row level security;
revoke all on public.retailer_invoice_email_logs from public, anon, authenticated;
grant select on public.retailer_invoice_email_logs to authenticated;

drop policy if exists retailer_invoice_email_logs_select_super_admin on public.retailer_invoice_email_logs;
create policy retailer_invoice_email_logs_select_super_admin on public.retailer_invoice_email_logs
  for select to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- 4. PRIVATE STORAGE BUCKET (`retailer-invoices`)
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('retailer-invoices', 'retailer-invoices', false)
    on conflict (id) do update set public = false;
  end if;
exception
  when others then
    raise notice 'Storage bucket setup skipped: %', sqlerrm;
end $$;

-- ============================================================================
-- 5. SYNC EXISTING GENERATED DEMO INVOICE (`INV-2026-1001`) IF DEMO SHIFT EXISTS
-- ============================================================================

insert into public.retailer_invoices (
  id,
  invoice_number,
  shift_id,
  store_id,
  retailer_user_id,
  worker_id,
  time_entry_id,
  retailer_name,
  store_name,
  store_address,
  contact_person_name,
  contact_phone,
  contact_email,
  shift_task_type,
  shift_location,
  shift_date,
  shift_start_time,
  shift_end_time,
  approved_hours,
  hourly_rate,
  subtotal_cents,
  tax_cents,
  total_cents,
  currency,
  line_items,
  pdf_storage_bucket,
  pdf_storage_path,
  pdf_size_bytes,
  pdf_sha256,
  invoice_status,
  email_status,
  created_by,
  issued_at,
  created_at,
  updated_at
)
select
  '4e111898-6e01-45e1-81cd-14d5e63e8bdf'::uuid,
  'INV-2026-1001',
  s.id,
  s.store_id,
  coalesce(
    s.created_by,
    (select su.auth_user_id from public.store_users su where su.store_id = s.store_id order by su.created_at asc limit 1)
  ),
  s.accepted_by,
  te.id,
  st.name,
  st.name,
  st.address,
  'Alex Demo (ShiftSupport Invoice QA Retailer)',
  '+1 202-555-0147',
  'invoice-qa@shiftsupport.test',
  s.task_type,
  coalesce(s.shift_location, st.address),
  '2026-11-23'::date,
  s.start_time,
  s.end_time,
  6.00,
  28.00,
  16800,
  0,
  16800,
  'USD',
  jsonb_build_array(
    jsonb_build_object(
      'workerId', s.accepted_by,
      'workerName', 'Invoice QA Worker',
      'timeEntryId', te.id,
      'hoursWorked', 6,
      'hourlyRate', 28,
      'totalCents', 16800
    )
  ),
  'retailer-invoices',
  'stores/85532fa6-235d-4dbc-9b96-2a31ee99ecd5/INV-2026-1001.pdf',
  4621,
  '1a16e6e2c5cd5a9ac87f0b528eaacd1afb8b526e571e8670172c90ec5d09abff',
  'generated',
  'not_sent',
  (select u.id from auth.users u where u.id = '1f77befb-5068-4728-8cc5-336cca85b9c6'::uuid),
  '2026-11-24T17:00:00.000Z'::timestamptz,
  '2026-11-24T17:00:00.000Z'::timestamptz,
  '2026-11-24T17:00:00.000Z'::timestamptz
from public.shifts s
join public.stores st on st.id = s.store_id
left join public.shift_time_entries te on te.shift_id = s.id
where s.id = 'de79279c-b28a-4803-a3dd-fa7292e5cbb5'::uuid
on conflict (shift_id) do nothing;

select setval('public.retailer_invoice_number_seq', 1001, true);

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (only if this migration ever needs to be reverted)
-- ============================================================================
--
-- drop table if exists public.retailer_invoice_email_logs;
-- drop table if exists public.retailer_invoices;
-- drop sequence if exists public.retailer_invoice_number_seq;
