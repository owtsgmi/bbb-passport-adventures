-- Each signed-in player owns their raw StaFi reference. It is never returned
-- through a club payload or exposed to other club members.
alter table public.user_private_settings
  add column if not exists stafi_url text
  check (stafi_url is null or char_length(stafi_url) <= 1000);

