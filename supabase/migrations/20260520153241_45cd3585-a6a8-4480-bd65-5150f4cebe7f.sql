
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique,
  aura_balance numeric(14,2) not null default 100,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles viewable by authenticated users"
  on public.profiles for select
  to authenticated using (true);

-- No direct insert/update/delete from clients; all via SECURITY DEFINER functions.

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  amount_sent numeric(14,2) not null,
  amount_received numeric(14,2) not null,
  message text,
  created_at timestamptz not null default now()
);

create index transactions_sender_created_idx on public.transactions(sender_id, created_at desc);
create index transactions_created_idx on public.transactions(created_at desc);

alter table public.transactions enable row level security;

create policy "Transactions viewable by authenticated users"
  on public.transactions for select
  to authenticated using (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Set nickname (only if not yet set)
create or replace function public.set_nickname(p_nickname text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text;
  v_existing text;
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_clean := trim(p_nickname);

  if v_clean !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Invalid nickname: must be 3-20 chars, letters/numbers/underscore';
  end if;

  select nickname into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    raise exception 'Nickname already set';
  end if;

  if exists (select 1 from public.profiles where lower(nickname) = lower(v_clean)) then
    raise exception 'Nickname is taken, comrade';
  end if;

  update public.profiles set nickname = v_clean where id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

-- Send aura
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
  v_limit numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if v_amount > 10 then
    raise exception 'Transaction denied by the State: max 10 Aura per transfer';
  end if;

  -- Lock sender row
  select * into v_sender from public.profiles where id = v_uid for update;
  if v_sender.nickname is null then
    raise exception 'Set your nickname first, comrade';
  end if;

  -- Find recipient
  select * into v_receiver from public.profiles
    where lower(nickname) = lower(trim(p_recipient))
    for update;
  if v_receiver.id is null then
    raise exception 'The State does not recognize this comrade';
  end if;

  if v_receiver.id = v_sender.id then
    raise exception 'You cannot send Aura to yourself, comrade';
  end if;

  if v_sender.aura_balance < v_amount then
    raise exception 'Insufficient Aura, comrade';
  end if;

  -- 10% daily limit on current balance
  v_limit := round(v_sender.aura_balance * 0.10, 2);
  select coalesce(sum(amount_sent), 0) into v_recent_sum
    from public.transactions
    where sender_id = v_sender.id
      and created_at > now() - interval '24 hours';

  if v_recent_sum + v_amount > v_limit then
    raise exception 'Transaction denied by the State: daily limit exceeded';
  end if;

  v_msg := nullif(trim(coalesce(p_message, '')), '');
  if v_msg is not null and length(v_msg) > 200 then
    v_msg := left(v_msg, 200);
  end if;

  update public.profiles set aura_balance = aura_balance - v_amount where id = v_sender.id
    returning * into v_sender;
  update public.profiles set aura_balance = aura_balance + (v_amount * 1.5) where id = v_receiver.id;

  insert into public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    values (v_sender.id, v_receiver.id, v_amount, v_amount * 1.5, v_msg);

  return v_sender;
end;
$$;

-- Realtime
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.profiles;
