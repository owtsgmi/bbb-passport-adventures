-- Allocate each manual 1,000 L$ bookkeeping payment in one database
-- transaction. Only the service-role club API can execute this function.
create or replace function public.allocate_club_payment(
  p_club_id uuid,
  p_handler uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_beneficiary uuid;
  v_balance integer;
  v_left integer := 1000;
  v_take integer;
  v_now timestamptz := now();
  r record;
begin
  select role into v_role
  from public.club_members
  where club_id = p_club_id and user_id = p_handler;

  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'manager_required';
  end if;

  select id into v_beneficiary
  from public.club_players
  where club_id = p_club_id and is_active and is_beneficiary
  order by sort_order, created_at
  limit 1;

  if v_beneficiary is null then
    raise exception 'beneficiary_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text, 0));

  select coalesce(sum(amount - paid_amount),0)::integer into v_balance
  from public.club_rewards
  where club_id = p_club_id and beneficiary_player_id = v_beneficiary;

  if v_balance < 1000 then
    raise exception 'threshold_not_met';
  end if;

  for r in
    select id, amount, paid_amount
    from public.club_rewards
    where club_id = p_club_id
      and beneficiary_player_id = v_beneficiary
      and paid_amount < amount
    order by awarded_at, id
    for update
  loop
    exit when v_left = 0;
    v_take := least(r.amount - r.paid_amount, v_left);
    update public.club_rewards
    set paid_amount = r.paid_amount + v_take,
        paid_at = case when r.paid_amount + v_take >= r.amount then v_now else null end
    where id = r.id;
    v_left := v_left - v_take;
  end loop;

  update public.club_collect_requests
  set status = 'paid', handled_at = v_now, handled_by = p_handler
  where club_id = p_club_id and status = 'pending';

  select coalesce(sum(amount - paid_amount),0)::integer into v_balance
  from public.club_rewards
  where club_id = p_club_id and beneficiary_player_id = v_beneficiary;

  return v_balance;
end
$$;

revoke all on function public.allocate_club_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.allocate_club_payment(uuid,uuid) to service_role;

