-- Keep Adventure Treasure payer and recipient as distinct club-player roles.
update public.club_players
set is_beneficiary = false
where is_payer = true
  and is_beneficiary = true;

create unique index if not exists club_players_one_payer_per_club
  on public.club_players (club_id)
  where is_payer = true;

create unique index if not exists club_players_one_beneficiary_per_club
  on public.club_players (club_id)
  where is_beneficiary = true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'club_players_payer_recipient_distinct'
      and conrelid = 'public.club_players'::regclass
  ) then
    alter table public.club_players
      add constraint club_players_payer_recipient_distinct
      check (not (is_payer and is_beneficiary));
  end if;
end $$;
