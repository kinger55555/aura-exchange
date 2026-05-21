-- Allow nickname changes
create or replace function public.set_nickname(p_nickname text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text;
  v_row public.profiles;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_clean := trim(p_nickname);
  if v_clean !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Invalid nickname: must be 3-20 chars, letters/numbers/underscore';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(v_clean) and id <> v_uid) then
    raise exception 'Nickname is taken, comrade';
  end if;
  update public.profiles set nickname = v_clean where id = v_uid returning * into v_row;
  return v_row;
end;
$$;

-- Fix daily limit: base on balance at start of 24h window (current + already sent)
create or replace function public.send_aura(p_recipient text, p_amount numeric, p_message text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sender public.profiles;
  v_receiver public.profiles;
  v_recent_sum numeric;
  v_base numeric;
  v_limit numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if v_amount > 10 then raise exception 'Transaction denied by the State: max 10 Aura per transfer'; end if;

  select * into v_sender from public.profiles where id = v_uid for update;
  if v_sender.nickname is null then raise exception 'Set your nickname first, comrade'; end if;

  select * into v_receiver from public.profiles
    where lower(nickname) = lower(trim(p_recipient)) for update;
  if v_receiver.id is null then raise exception 'The State does not recognize this comrade'; end if;
  if v_receiver.id = v_sender.id then raise exception 'You cannot send Aura to yourself, comrade'; end if;
  if v_sender.aura_balance < v_amount then raise exception 'Insufficient Aura, comrade'; end if;

  select coalesce(sum(amount_sent), 0) into v_recent_sum
    from public.transactions
    where sender_id = v_sender.id and created_at > now() - interval '24 hours';

  -- Base = balance at start of 24h window (current + already sent in window)
  v_base := v_sender.aura_balance + v_recent_sum;
  v_limit := round(v_base * 0.10, 2);

  if v_recent_sum + v_amount > v_limit then
    raise exception 'Transaction denied by the State: daily limit exceeded (% / % Aura used)', v_recent_sum, v_limit;
  end if;

  v_msg := nullif(trim(coalesce(p_message, '')), '');
  if v_msg is not null and length(v_msg) > 200 then v_msg := left(v_msg, 200); end if;

  update public.profiles set aura_balance = aura_balance - v_amount where id = v_sender.id returning * into v_sender;
  update public.profiles set aura_balance = aura_balance + (v_amount * 1.5) where id = v_receiver.id;

  insert into public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    values (v_sender.id, v_receiver.id, v_amount, v_amount * 1.5, v_msg);

  return v_sender;
end;
$$;

-- Report comrade: both lose the same amount
create or replace function public.report_comrade(p_recipient text, p_amount numeric, p_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reporter public.profiles;
  v_target public.profiles;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if v_amount > 5 then raise exception 'Denounciation denied: max 5 Aura per report'; end if;

  select * into v_reporter from public.profiles where id = v_uid for update;
  if v_reporter.nickname is null then raise exception 'Set your nickname first, comrade'; end if;
  if v_reporter.aura_balance < v_amount then raise exception 'Insufficient Aura to file report, comrade'; end if;

  select * into v_target from public.profiles
    where lower(nickname) = lower(trim(p_recipient)) for update;
  if v_target.id is null then raise exception 'The State does not recognize this comrade'; end if;
  if v_target.id = v_reporter.id then raise exception 'You cannot denounce yourself, comrade'; end if;

  v_msg := nullif(trim(coalesce(p_reason, '')), '');
  if v_msg is not null and length(v_msg) > 200 then v_msg := left(v_msg, 200); end if;
  v_msg := '[REPORT] ' || coalesce(v_msg, 'No reason given');

  update public.profiles set aura_balance = aura_balance - v_amount where id = v_reporter.id returning * into v_reporter;
  update public.profiles set aura_balance = greatest(aura_balance - v_amount, aura_balance - v_amount) where id = v_target.id;
  -- Note: above keeps it simple; negative balances allowed (Loser rank)

  insert into public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    values (v_reporter.id, v_target.id, v_amount, -v_amount, v_msg);

  return v_reporter;
end;
$$;