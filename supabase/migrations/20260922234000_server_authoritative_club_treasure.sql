-- Make club Treasure roles explicit and keep reward creation/payment authoritative.
alter table public.club_players
  add column if not exists is_beneficiary boolean not null default false;

-- Preserve the original two-player roles and choose a sensible beneficiary for
-- any club created before this column existed.
update public.club_players
set is_beneficiary = true
where id = '00000000-0000-4000-8000-000000000102';

with ranked as (
  select id,
         row_number() over (
           partition by club_id
           order by (not is_payer) desc, is_active desc, sort_order, created_at
         ) as rn
  from public.club_players
), missing as (
  select c.id as club_id
  from public.clubs c
  where not exists (
    select 1 from public.club_players p
    where p.club_id = c.id and p.is_beneficiary
  )
)
update public.club_players p
set is_beneficiary = true
from ranked r, missing m
where p.id = r.id and p.club_id = m.club_id and r.rn = 1;

-- Keep one explicit payer and one explicit Treasure beneficiary per club.
with ranked as (
  select id,
         row_number() over (partition by club_id order by sort_order, created_at) as rn
  from public.club_players
  where is_payer
)
update public.club_players p
set is_payer = false
from ranked r
where p.id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (partition by club_id order by sort_order, created_at) as rn
  from public.club_players
  where is_beneficiary
)
update public.club_players p
set is_beneficiary = false
from ranked r
where p.id = r.id and r.rn > 1;

create unique index if not exists club_players_one_payer_idx
  on public.club_players(club_id) where is_payer;
create unique index if not exists club_players_one_beneficiary_idx
  on public.club_players(club_id) where is_beneficiary;

alter table public.club_adventure_runs
  add column if not exists stamp_ids integer[] not null default '{}';

alter table public.club_adventure_runs
  drop constraint if exists club_adventure_runs_three_stamps;
alter table public.club_adventure_runs
  add constraint club_adventure_runs_three_stamps
  check (cardinality(stamp_ids) in (0,3));

create index if not exists club_adventure_runs_stamp_ids_idx
  on public.club_adventure_runs using gin(stamp_ids);

