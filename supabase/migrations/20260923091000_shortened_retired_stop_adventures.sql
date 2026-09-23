-- Allow an immutable adventure definition to shrink when one or more passport
-- stops retire. Completed run snapshots remain unchanged; active/new runs may
-- contain 1, 2, or 3 required stamps.

alter table public.club_adventure_runs
  drop constraint if exists club_adventure_runs_three_stamps;

alter table public.club_adventure_runs
  drop constraint if exists club_adventure_runs_up_to_three_stamps;

alter table public.club_adventure_runs
  add constraint club_adventure_runs_up_to_three_stamps
  check (cardinality(stamp_ids) between 0 and 3);
