-- ShiftSupport — Migration 0004
-- Add a per-shift location while preserving all existing shifts and data.

begin;

alter table public.shifts
  add column if not exists shift_location text;

-- Give existing shifts a stable location snapshot where a store address exists.
update public.shifts sh
set shift_location = s.address
from public.stores s
where sh.store_id = s.id
  and sh.shift_location is null
  and nullif(btrim(s.address), '') is not null;

alter table public.shifts
  drop constraint if exists shifts_shift_location_not_blank;

alter table public.shifts
  add constraint shifts_shift_location_not_blank
  check (shift_location is null or nullif(btrim(shift_location), '') is not null);

commit;

notify pgrst, 'reload schema';
