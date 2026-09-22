-- Multi-club schema snapshot. This migration is intentionally additive and preserves the legacy board.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Adventurer' check (char_length(display_name) between 1 and 60),
 sl_username text check (sl_username is null or char_length(sl_username) between 1 and 80),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.clubs (
 id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 80),
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
 owner_id uuid references auth.users(id) on delete set null, join_code_hash text,
 treasure_enabled boolean not null default false,
 payout_threshold integer not null default 1000 check (payout_threshold=1000),
 is_legacy boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists clubs_join_code_hash_idx on public.clubs(join_code_hash) where join_code_hash is not null;
create index if not exists clubs_owner_id_idx on public.clubs(owner_id);
create table if not exists public.club_members (
 club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','admin','member')),
 joined_at timestamptz not null default now(), primary key(club_id,user_id)
);
create index if not exists club_members_user_id_idx on public.club_members(user_id,club_id);
create table if not exists public.club_players (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 display_name text not null check (char_length(display_name) between 1 and 60),
 sl_username text check (sl_username is null or char_length(sl_username) between 1 and 80),
 sort_order smallint not null default 0, is_active boolean not null default true, is_payer boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(club_id,user_id)
);
create index if not exists club_players_club_sort_idx on public.club_players(club_id,is_active,sort_order);
create index if not exists club_players_user_id_idx on public.club_players(user_id);
create table if not exists public.club_board_state (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 started integer[] not null default '{}', current_adventure integer not null default 0 check(current_adventure>=0),
 adventure_locked boolean not null default true, adventure_rewards jsonb not null default '{}'::jsonb,
 payout_log jsonb not null default '[]'::jsonb, revision bigint not null default 1 check(revision>0),
 updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(),
 check(jsonb_typeof(adventure_rewards)='object'), check(jsonb_typeof(payout_log)='array')
);
create index if not exists club_board_state_updated_by_idx on public.club_board_state(updated_by);
create table if not exists public.club_adventure_runs (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 adventure_id integer not null check(adventure_id>0), status text not null default 'active' check(status in ('active','completed','retired')),
 locked boolean not null default true, started_by uuid references auth.users(id) on delete set null,
 started_at timestamptz not null default now(), completed_at timestamptz, unique(club_id,adventure_id)
);
create index if not exists club_adventure_runs_club_status_idx on public.club_adventure_runs(club_id,status,started_at desc);
create index if not exists club_adventure_runs_started_by_idx on public.club_adventure_runs(started_by);
create table if not exists public.club_run_participants (
 run_id uuid not null references public.club_adventure_runs(id) on delete cascade,
 player_id uuid not null references public.club_players(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(run_id,player_id)
);
create index if not exists club_run_participants_player_idx on public.club_run_participants(player_id,run_id);
create table if not exists public.club_stamp_progress (
 club_id uuid not null references public.clubs(id) on delete cascade,
 player_id uuid not null references public.club_players(id) on delete cascade,
 stamp_id integer not null check(stamp_id>0), source text not null default 'manual' check(source in ('manual','stafi','legacy','admin')),
 completed_at timestamptz not null default now(), completed_by uuid references auth.users(id) on delete set null,
 primary key(club_id,player_id,stamp_id)
);
create index if not exists club_stamp_progress_player_idx on public.club_stamp_progress(player_id,stamp_id);
create index if not exists club_stamp_progress_completed_by_idx on public.club_stamp_progress(completed_by);
create table if not exists public.club_rewards (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 run_id uuid not null unique references public.club_adventure_runs(id) on delete cascade,
 beneficiary_player_id uuid references public.club_players(id) on delete set null,
 amount integer not null check(amount between 20 and 100), paid_amount integer not null default 0 check(paid_amount>=0 and paid_amount<=amount),
 awarded_at timestamptz not null default now(), paid_at timestamptz
);
create index if not exists club_rewards_club_unpaid_idx on public.club_rewards(club_id,paid_at,awarded_at);
create index if not exists club_rewards_beneficiary_idx on public.club_rewards(beneficiary_player_id);
create table if not exists public.club_collect_requests (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 requested_by uuid not null references auth.users(id) on delete cascade,
 beneficiary_player_id uuid not null references public.club_players(id) on delete cascade,
 amount integer not null default 1000 check(amount=1000), status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 created_at timestamptz not null default now(), handled_at timestamptz, handled_by uuid references auth.users(id) on delete set null
);
create unique index if not exists club_collect_one_pending_idx on public.club_collect_requests(club_id,beneficiary_player_id) where status='pending';
create index if not exists club_collect_requests_club_status_idx on public.club_collect_requests(club_id,status,created_at desc);
create index if not exists club_collect_requested_by_idx on public.club_collect_requests(requested_by);
create index if not exists club_collect_beneficiary_idx on public.club_collect_requests(beneficiary_player_id);
create index if not exists club_collect_handled_by_idx on public.club_collect_requests(handled_by);
create table if not exists public.user_private_settings (
 user_id uuid primary key references auth.users(id) on delete cascade, ciphertext text, iv text, salt text,
 version integer not null default 1, updated_at timestamptz not null default now(),
 check((ciphertext is null and iv is null and salt is null) or (ciphertext is not null and iv is not null and salt is not null))
);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id,display_name)
 values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,'Adventurer'),'@',1),'Adventurer'),60))
 on conflict(user_id) do nothing; return new;
end $$;
revoke all on function public.set_updated_at() from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at before update on public.clubs for each row execute function public.set_updated_at();
drop trigger if exists club_players_set_updated_at on public.club_players;
create trigger club_players_set_updated_at before update on public.club_players for each row execute function public.set_updated_at();
drop trigger if exists club_board_state_set_updated_at on public.club_board_state;
create trigger club_board_state_set_updated_at before update on public.club_board_state for each row execute function public.set_updated_at();
drop trigger if exists user_private_settings_set_updated_at on public.user_private_settings;
create trigger user_private_settings_set_updated_at before update on public.user_private_settings for each row execute function public.set_updated_at();

create or replace function private.is_club_member(p_club_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.club_members m where m.club_id=p_club_id and m.user_id=(select auth.uid())) $$;
revoke all on function private.is_club_member(uuid) from public,anon;
grant execute on function private.is_club_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_players enable row level security;
alter table public.club_board_state enable row level security;
alter table public.club_adventure_runs enable row level security;
alter table public.club_run_participants enable row level security;
alter table public.club_stamp_progress enable row level security;
alter table public.club_rewards enable row level security;
alter table public.club_collect_requests enable row level security;
alter table public.user_private_settings enable row level security;
create policy "profiles read own" on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy "profiles update own" on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "clubs read member" on public.clubs for select to authenticated using ((select private.is_club_member(id)));
create policy "members read club" on public.club_members for select to authenticated using ((select private.is_club_member(club_id)));
create policy "players read club" on public.club_players for select to authenticated using ((select private.is_club_member(club_id)));
create policy "board read club" on public.club_board_state for select to authenticated using ((select private.is_club_member(club_id)));
create policy "runs read club" on public.club_adventure_runs for select to authenticated using ((select private.is_club_member(club_id)));
create policy "participants read club" on public.club_run_participants for select to authenticated using (exists(select 1 from public.club_adventure_runs r where r.id=run_id and (select private.is_club_member(r.club_id))));
create policy "stamps read club" on public.club_stamp_progress for select to authenticated using ((select private.is_club_member(club_id)));
create policy "rewards read club" on public.club_rewards for select to authenticated using ((select private.is_club_member(club_id)));
create policy "collect requests read club" on public.club_collect_requests for select to authenticated using ((select private.is_club_member(club_id)));
create policy "private settings own" on public.user_private_settings for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.profiles,public.clubs,public.club_members,public.club_players,public.club_board_state,public.club_adventure_runs,public.club_run_participants,public.club_stamp_progress,public.club_rewards,public.club_collect_requests,public.user_private_settings from anon;
grant select on public.profiles,public.clubs,public.club_members,public.club_players,public.club_board_state,public.club_adventure_runs,public.club_run_participants,public.club_stamp_progress,public.club_rewards,public.club_collect_requests to authenticated;
grant update(display_name,sl_username) on public.profiles to authenticated;
grant select,insert,update,delete on public.user_private_settings to authenticated;

insert into public.clubs(id,name,slug,treasure_enabled,is_legacy)
select '00000000-0000-4000-8000-000000000001','Original Passport Club','original-passport-club',b.adventure_treasure_enabled,true
from public.bbb_board_state b where b.id=1 on conflict(id) do nothing;
insert into public.club_players(id,club_id,display_name,sl_username,sort_order,is_payer)
select '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001',coalesce(tab_partner_name,'First player'),nullif(tab_partner_name,''),1,true
from public.bbb_board_state where id=1 on conflict(id) do nothing;
insert into public.club_players(id,club_id,display_name,sl_username,sort_order,is_payer)
select '00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001',coalesce(tab_me_name,'Second player'),nullif(tab_me_name,''),2,false
from public.bbb_board_state where id=1 on conflict(id) do nothing;
insert into public.club_board_state(club_id,started,current_adventure,adventure_locked,adventure_rewards,payout_log)
select '00000000-0000-4000-8000-000000000001',coalesce(started,'{}'),coalesce(last_adventure,0),coalesce(adventure_locked,true),coalesce(adventure_rewards,'{}'::jsonb),coalesce(payout_log,'[]'::jsonb)
from public.bbb_board_state where id=1 on conflict(club_id) do nothing;
insert into public.club_stamp_progress(club_id,player_id,stamp_id,source)
select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',x,'legacy'
from public.bbb_board_state b cross join lateral unnest(coalesce(b.partner_done,'{}')) x where b.id=1 on conflict do nothing;
insert into public.club_stamp_progress(club_id,player_id,stamp_id,source)
select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102',x,'legacy'
from public.bbb_board_state b cross join lateral unnest(coalesce(b.me_done,'{}')) x where b.id=1 on conflict do nothing;
