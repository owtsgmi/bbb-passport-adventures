-- Replace email magic-link identity with private SL-username/password accounts.
-- Existing game rows are preserved under disabled archive identities so this
-- cutover does not destroy historical club data.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.passport_users (
  id uuid primary key,
  sl_username text not null,
  sl_username_normalized text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 60),
  password_hash text not null,
  disabled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(sl_username) between 3 and 80),
  check (sl_username_normalized ~ '^[a-z0-9][a-z0-9.]{1,78}[a-z0-9]$')
);

create table if not exists public.passport_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.passport_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);
create index if not exists passport_sessions_user_idx on public.passport_sessions(user_id,expires_at);
create index if not exists passport_sessions_expiry_idx on public.passport_sessions(expires_at);

create table if not exists public.passport_auth_attempts (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action in ('login','register')),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(key_hash,action)
);

alter table public.passport_users enable row level security;
alter table public.passport_sessions enable row level security;
alter table public.passport_auth_attempts enable row level security;
revoke all on public.passport_users,public.passport_sessions,public.passport_auth_attempts from public,anon,authenticated;

-- Preserve any IDs previously issued by Supabase Auth without copying email.
insert into public.passport_users(id,sl_username,sl_username_normalized,display_name,password_hash,disabled_at)
select u.id,
       'archived.' || replace(u.id::text,'-',''),
       'archived.' || replace(u.id::text,'-',''),
       'Archived account',
       '!disabled',
       now()
from auth.users u
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;

alter table public.profiles drop constraint if exists profiles_user_id_fkey;
alter table public.clubs drop constraint if exists clubs_owner_id_fkey;
alter table public.club_members drop constraint if exists club_members_user_id_fkey;
alter table public.club_players drop constraint if exists club_players_user_id_fkey;
alter table public.club_board_state drop constraint if exists club_board_state_updated_by_fkey;
alter table public.club_adventure_runs drop constraint if exists club_adventure_runs_started_by_fkey;
alter table public.club_stamp_progress drop constraint if exists club_stamp_progress_completed_by_fkey;
alter table public.club_collect_requests drop constraint if exists club_collect_requests_requested_by_fkey;
alter table public.club_collect_requests drop constraint if exists club_collect_requests_handled_by_fkey;
alter table public.user_private_settings drop constraint if exists user_private_settings_user_id_fkey;

alter table public.profiles add constraint profiles_user_id_fkey foreign key(user_id) references public.passport_users(id) on delete cascade;
alter table public.clubs add constraint clubs_owner_id_fkey foreign key(owner_id) references public.passport_users(id) on delete set null;
alter table public.club_members add constraint club_members_user_id_fkey foreign key(user_id) references public.passport_users(id) on delete cascade;
alter table public.club_players add constraint club_players_user_id_fkey foreign key(user_id) references public.passport_users(id) on delete set null;
alter table public.club_board_state add constraint club_board_state_updated_by_fkey foreign key(updated_by) references public.passport_users(id) on delete set null;
alter table public.club_adventure_runs add constraint club_adventure_runs_started_by_fkey foreign key(started_by) references public.passport_users(id) on delete set null;
alter table public.club_stamp_progress add constraint club_stamp_progress_completed_by_fkey foreign key(completed_by) references public.passport_users(id) on delete set null;
alter table public.club_collect_requests add constraint club_collect_requests_requested_by_fkey foreign key(requested_by) references public.passport_users(id) on delete cascade;
alter table public.club_collect_requests add constraint club_collect_requests_handled_by_fkey foreign key(handled_by) references public.passport_users(id) on delete set null;
alter table public.user_private_settings add constraint user_private_settings_user_id_fkey foreign key(user_id) references public.passport_users(id) on delete cascade;

-- Client access now goes only through Edge Functions that validate opaque
-- Passport sessions. Old Supabase-authenticated sessions get no table access.
revoke all on public.profiles,public.clubs,public.club_members,public.club_players,
  public.club_board_state,public.club_adventure_runs,public.club_run_participants,
  public.club_stamp_progress,public.club_rewards,public.club_collect_requests,
  public.user_private_settings from authenticated;

create or replace function public.passport_register_user(
  p_user_id uuid,
  p_sl_username text,
  p_password text,
  p_display_name text
) returns table(id uuid,sl_username text,display_name text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text;
  v_display text;
begin
  v_username := lower(regexp_replace(btrim(coalesce(p_sl_username,'')),'\s+','.','g'));
  v_display := left(btrim(coalesce(nullif(p_display_name,''),p_sl_username)),60);
  if v_username !~ '^[a-z0-9][a-z0-9.]{1,78}[a-z0-9]$' then
    raise exception 'invalid_sl_username' using errcode='22023';
  end if;
  if char_length(coalesce(p_password,'')) < 8 or char_length(p_password) > 128 then
    raise exception 'invalid_password' using errcode='22023';
  end if;
  insert into public.passport_users(id,sl_username,sl_username_normalized,display_name,password_hash)
  values(p_user_id,v_username,v_username,v_display,extensions.crypt(p_password,extensions.gen_salt('bf',12)));
  insert into public.profiles(user_id,display_name,sl_username)
  values(p_user_id,v_display,v_username);
  return query select p_user_id,v_username,v_display;
end $$;

create or replace function public.passport_verify_password(
  p_sl_username text,
  p_password text
) returns table(id uuid,sl_username text,display_name text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text;
begin
  v_username := lower(regexp_replace(btrim(coalesce(p_sl_username,'')),'\s+','.','g'));
  return query
  update public.passport_users u
     set last_login_at=now(),updated_at=now()
   where u.sl_username_normalized=v_username
     and u.disabled_at is null
     and u.password_hash=extensions.crypt(coalesce(p_password,''),u.password_hash)
  returning u.id,u.sl_username,u.display_name;
end $$;

revoke all on function public.passport_register_user(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.passport_verify_password(text,text) from public,anon,authenticated;
grant execute on function public.passport_register_user(uuid,text,text,text) to service_role;
grant execute on function public.passport_verify_password(text,text) to service_role;

drop trigger if exists passport_users_set_updated_at on public.passport_users;
create trigger passport_users_set_updated_at before update on public.passport_users
for each row execute function public.set_updated_at();
