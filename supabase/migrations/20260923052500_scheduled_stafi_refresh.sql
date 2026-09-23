-- Scheduled StaFi refresh and live passport summary.
alter table public.user_private_settings
  add column if not exists stafi_uncollected_count integer,
  add column if not exists stafi_available_count integer;

alter table public.club_players
  add column if not exists stafi_collected_count integer,
  add column if not exists stafi_available_count integer,
  add column if not exists stafi_last_success_at timestamptz;

create table if not exists public.internal_job_config (
  name text primary key,
  secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.internal_job_config enable row level security;
revoke all on public.internal_job_config from anon, authenticated;
grant select on public.internal_job_config to service_role;

insert into public.internal_job_config(name,secret)
select 'stafi-cron', encode(gen_random_bytes(32),'hex')
where not exists (select 1 from public.internal_job_config where name='stafi-cron');

-- Only the board's current adventure stays active.
update public.club_adventure_runs r
set status='retired', locked=false
from public.club_board_state b
where b.club_id=r.club_id
  and r.status='active'
  and r.adventure_id<>b.current_adventure;

-- The old payout-push poll is no longer part of the current product.
select cron.unschedule(jobid)
from cron.job
where jobname in ('bbb-payout-push-check','bbb-stafi-refresh');

select cron.schedule(
  'bbb-stafi-refresh',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://tzxlrglgwzinefutledx.supabase.co/functions/v1/club-api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-bbb-job-secret',(select secret from public.internal_job_config where name='stafi-cron')
    ),
    body := '{"action":"cron_stafi_refresh"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
