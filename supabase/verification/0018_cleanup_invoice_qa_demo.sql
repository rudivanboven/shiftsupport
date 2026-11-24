-- ============================================================================
--  ShiftSupport — Cleanup Procedure for Invoice QA Demo Records
--
--  NOTE: Do NOT run this file while you are still testing the demo shift and
--  invoice in `/super-admin/invoices` and `/super-admin/shifts`.
--
--  When you are finished testing and want to remove ONLY the isolated demo
--  records (`invoice-qa@shiftsupport.test` and `worker-qa@shiftsupport.test`),
--  run this script in the Supabase SQL Editor. It targets strictly the two
--  `.test` demo accounts and their demo store/shift/invoice.
-- ============================================================================

begin;

-- 1. Remove demo invoice records (if table migration 0018 has been applied)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'retailer_invoices'
  ) then
    delete from public.retailer_invoices
     where contact_email = 'invoice-qa@shiftsupport.test'
        or store_name = 'Invoice QA Demo Store';
  end if;
end $$;

-- 2. Remove demo shift, application, accept, and time entry records
delete from public.shifts
 where task_type = 'Invoice QA Demo Shift'
   and store_id in (
     select id from public.stores where name = 'Invoice QA Demo Store'
   );

-- 3. Remove demo store and store_users link
delete from public.store_users
 where lower(email) = 'invoice-qa@shiftsupport.test';

delete from public.stores
 where name = 'Invoice QA Demo Store'
   and address = '100 Demo Avenue, Testville, TX 00000, USA';

-- 4. Remove demo worker record
delete from public.workers
 where lower(email) = 'worker-qa@shiftsupport.test';

-- 5. Remove demo auth users (cascades to public.profiles)
delete from auth.users
 where lower(email) in (
   'invoice-qa@shiftsupport.test',
   'worker-qa@shiftsupport.test'
 );

commit;
