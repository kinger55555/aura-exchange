
-- 1. RANKS TABLE
CREATE TABLE public.ranks (
  rank int PRIMARY KEY,
  name text NOT NULL,
  upgrade_cost numeric NOT NULL,
  max_aura numeric NOT NULL,
  max_send numeric NOT NULL,
  tickets int NOT NULL,
  multiplier numeric NOT NULL,
  salary numeric NOT NULL,
  super_tickets int NOT NULL
);
GRANT SELECT ON public.ranks TO authenticated, anon;
GRANT ALL ON public.ranks TO service_role;
ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ranks readable" ON public.ranks FOR SELECT USING (true);

INSERT INTO public.ranks (rank, name, upgrade_cost, max_aura, max_send, tickets, multiplier, salary, super_tickets) VALUES
(1,  'Comrade',             0,      100,    100,  0, 1.0,   0, 0),
(2,  'Peasant Worker',      1000,   200,    200,  1, 1.0,   0, 0),
(3,  'Factory Foreman',     2000,   400,    300,  2, 1.0,   0, 0),
(4,  'Vanguard Worker',     4000,   800,    400,  3, 1.1,   0, 0),
(5,  'Union Leader',        8000,   1600,   500,  4, 1.2,   25, 0),
(6,  'People''s Commissar', 16000,  3200,   600,  5, 1.3,   50, 0),
(7,  'Politburo Official',  32000,  6400,   700,  6, 1.4,   100, 0),
(8,  'General Secretary',   64000,  12800,  800,  7, 1.5,   200, 0),
(9,  'Stalin',              128000, 25600,  900,  8, 1.6,   400, 1),
(10, 'Stalin+',             256000, 51200,  1000, 9, 1.7,   800, 2);

-- 2. RANK INFO HELPER (handles infinite Stalin+++ ranks via formulas)
CREATE OR REPLACE FUNCTION public.get_rank_info(p_rank int)
RETURNS public.ranks
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.ranks;
BEGIN
  IF p_rank < 1 THEN p_rank := 1; END IF;
  SELECT * INTO v_row FROM public.ranks WHERE rank = p_rank;
  IF v_row.rank IS NOT NULL THEN RETURN v_row; END IF;
  v_row.rank := p_rank;
  v_row.name := 'Stalin' || repeat('+', p_rank - 9);
  v_row.upgrade_cost := 1000 * power(2, p_rank - 2)::numeric;
  v_row.max_aura := 100 * power(2, p_rank - 1)::numeric;
  v_row.max_send := 100 * p_rank;
  v_row.tickets := p_rank - 1;
  v_row.multiplier := CASE WHEN p_rank < 4 THEN 1.0 ELSE 1.0 + 0.1 * (p_rank - 3) END;
  v_row.salary := CASE WHEN p_rank < 5 THEN 0 ELSE 25 * power(2, p_rank - 5)::numeric END;
  v_row.super_tickets := CASE WHEN p_rank < 9 THEN 0 ELSE power(2, p_rank - 9)::int END;
  RETURN v_row;
END;$$;

-- 3. PROFILES current_rank
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_rank int NOT NULL DEFAULT 1;

-- 4. AURA BANK (single row)
CREATE TABLE public.aura_bank (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aura_bank TO authenticated;
GRANT ALL ON public.aura_bank TO service_role;
ALTER TABLE public.aura_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank readable" ON public.aura_bank FOR SELECT TO authenticated USING (true);
INSERT INTO public.aura_bank (id, balance) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- 5. RESET EVERYONE'S AURA TO 10
UPDATE public.profiles SET aura_balance = 10, current_rank = 1;

-- 6. PURCHASE RANK
CREATE OR REPLACE FUNCTION public.purchase_rank()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_next public.ranks;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  v_next := public.get_rank_info(v_me.current_rank + 1);
  IF v_me.aura_balance < v_next.upgrade_cost THEN
    RAISE EXCEPTION 'Insufficient Aura: need % to ascend to %', v_next.upgrade_cost, v_next.name;
  END IF;
  UPDATE public.profiles
    SET aura_balance = aura_balance - v_next.upgrade_cost,
        current_rank = v_next.rank
    WHERE id = v_uid RETURNING * INTO v_me;
  RETURN v_me;
END;$$;

-- 7. UPDATED send_aura: truncate received to 2 decimals, dust -> bank, flush to David when bank >= 1
CREATE OR REPLACE FUNCTION public.send_aura(p_recipient text, p_amount numeric, p_message text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sender public.profiles;
  v_receiver public.profiles;
  v_recent_sum numeric;
  v_base numeric;
  v_limit numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
  v_max_send numeric;
  v_gross numeric;
  v_received numeric;
  v_dust numeric;
  v_bank numeric;
  v_floor int;
  v_owner_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_sender FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_sender.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;

  v_max_send := (public.get_rank_info(v_sender.current_rank)).max_send;
  IF v_amount > v_max_send THEN RAISE EXCEPTION 'Your rank caps transfers at % Aura', v_max_send; END IF;

  SELECT * INTO v_receiver FROM public.profiles WHERE lower(nickname) = lower(trim(p_recipient)) FOR UPDATE;
  IF v_receiver.id IS NULL THEN RAISE EXCEPTION 'The State does not recognize this comrade'; END IF;
  IF v_receiver.id = v_sender.id THEN RAISE EXCEPTION 'You cannot send Aura to yourself, comrade'; END IF;
  IF v_sender.aura_balance < v_amount THEN RAISE EXCEPTION 'Insufficient Aura, comrade'; END IF;

  SELECT coalesce(sum(amount_sent),0) INTO v_recent_sum FROM public.transactions
    WHERE sender_id = v_sender.id AND created_at > now() - interval '24 hours';
  v_base := v_sender.aura_balance + v_recent_sum;
  v_limit := round(v_base * 0.10, 2);
  IF v_recent_sum + v_amount > v_limit THEN
    RAISE EXCEPTION 'Transaction denied: daily limit exceeded (% / % Aura used)', v_recent_sum, v_limit;
  END IF;

  v_msg := nullif(trim(coalesce(p_message,'')),'');
  IF v_msg IS NOT NULL AND length(v_msg) > 200 THEN v_msg := left(v_msg,200); END IF;

  -- Truncate received to 2 decimals; dust goes to the State Bank
  v_gross := v_amount * 1.5;
  v_received := trunc(v_gross * 100) / 100.0;
  v_dust := v_gross - v_received;

  UPDATE public.profiles SET aura_balance = aura_balance - v_amount WHERE id = v_sender.id RETURNING * INTO v_sender;
  UPDATE public.profiles SET aura_balance = aura_balance + v_received WHERE id = v_receiver.id;
  INSERT INTO public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    VALUES (v_sender.id, v_receiver.id, v_amount, v_received, v_msg);

  IF v_dust > 0 THEN
    UPDATE public.aura_bank SET balance = balance + v_dust, updated_at = now() WHERE id = 1
      RETURNING balance INTO v_bank;
    IF v_bank >= 1 THEN
      v_floor := floor(v_bank)::int;
      SELECT id INTO v_owner_id FROM public.profiles WHERE lower(nickname) = 'david' LIMIT 1;
      IF v_owner_id IS NOT NULL THEN
        UPDATE public.profiles SET aura_balance = aura_balance + v_floor WHERE id = v_owner_id;
        UPDATE public.aura_bank SET balance = balance - v_floor, updated_at = now() WHERE id = 1;
      END IF;
    END IF;
  END IF;

  RETURN v_sender;
END;$$;
