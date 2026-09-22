-- Signed-in invite guesses are limited per account. The 128-bit codes are
-- already unguessable; this adds a practical abuse/backoff boundary as well.
alter table public.profiles
  add column if not exists join_attempts integer not null default 0 check (join_attempts between 0 and 1000),
  add column if not exists join_window_started_at timestamptz;

