-- Add explicit gameplay modes: Solo, Babygirl, and Group.
-- Existing Treasure clubs become Babygirl; one-player non-Treasure clubs become Solo.

alter table public.clubs
  add column if not exists game_mode text;

update public.clubs c
set game_mode = case
  when c.treasure_enabled then 'babygirl'
  when (
    select count(*)
    from public.club_players cp
    where cp.club_id = c.id
      and cp.is_active
  ) <= 1 then 'solo'
  else 'group'
end
where c.game_mode is null;

alter table public.clubs
  alter column game_mode set default 'group',
  alter column game_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clubs_game_mode_check'
      and conrelid = 'public.clubs'::regclass
  ) then
    alter table public.clubs
      add constraint clubs_game_mode_check
      check (game_mode in ('solo','babygirl','group'));
  end if;
end $$;

update public.clubs
set treasure_enabled = (game_mode = 'babygirl');
