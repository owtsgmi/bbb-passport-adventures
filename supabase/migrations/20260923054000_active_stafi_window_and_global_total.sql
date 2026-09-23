-- Limit scheduled StaFi work to recently active play and keep one global live passport total.
alter table public.club_board_state
  add column if not exists last_active_at timestamptz;

create table if not exists public.app_runtime_state (
  id smallint primary key check (id = 1),
  passport_available_count integer,
  updated_at timestamptz not null default now()
);

alter table public.app_runtime_state enable row level security;
revoke all on public.app_runtime_state from anon, authenticated;

insert into public.app_runtime_state(id,passport_available_count)
values (
  1,
  (select coalesce(max(stafi_available_count),390) from public.user_private_settings)
)
on conflict (id) do update
set passport_available_count=coalesce(public.app_runtime_state.passport_available_count,excluded.passport_available_count),
    updated_at=public.app_runtime_state.updated_at;
