create table if not exists public.app_admins (
  user_id uuid primary key references public.passport_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_admin_sessions (
  token_hash text primary key,
  user_id uuid not null references public.passport_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text
);

alter table public.app_admins enable row level security;
alter table public.app_admin_sessions enable row level security;

revoke all on public.app_admins from anon, authenticated;
revoke all on public.app_admin_sessions from anon, authenticated;

insert into public.app_admins(user_id)
select id from public.passport_users
where lower(sl_username)='mikj333' and disabled_at is null
on conflict (user_id) do nothing;

create index if not exists app_admin_sessions_user_id_idx on public.app_admin_sessions(user_id);
create index if not exists app_admin_sessions_expires_at_idx on public.app_admin_sessions(expires_at);
