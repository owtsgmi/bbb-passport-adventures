-- Complete the account/passport cutover without exposing private StaFi URLs
-- to club rosters. Sync metadata is readable only through the authenticated API.
alter table public.club_players
  add column if not exists claimed_at timestamptz;

update public.club_players
set claimed_at=coalesce(claimed_at,updated_at,now())
where user_id is not null;

alter table public.club_adventure_runs
  add column if not exists stamp_refs jsonb not null default '[]'::jsonb
  check (jsonb_typeof(stamp_refs)='array' and jsonb_array_length(stamp_refs)<=3);

alter table public.user_private_settings
  add column if not exists stafi_sync_enabled boolean not null default false,
  add column if not exists stafi_verified_at timestamptz,
  add column if not exists stafi_last_sync_at timestamptz,
  add column if not exists stafi_last_success_at timestamptz,
  add column if not exists stafi_last_error text
    check (stafi_last_error is null or char_length(stafi_last_error)<=160),
  add column if not exists stafi_last_stamp_count integer
    check (stafi_last_stamp_count is null or stafi_last_stamp_count>=0);

comment on column public.user_private_settings.stafi_url is
  'Private per-account BBB StaFi progress URL. Never include in club roster payloads.';
comment on column public.club_adventure_runs.stamp_refs is
  'Server-validated descriptors for the three run stamps, used only for StaFi matching.';
