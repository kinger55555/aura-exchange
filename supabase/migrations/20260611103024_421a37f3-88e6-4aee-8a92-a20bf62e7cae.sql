
-- 1. Update unlock conditions for 4 titles
UPDATE public.titles SET unlock_condition = 'Send a transfer at exactly your max-send cap 3 times in one week.' WHERE id = '2180ca0c-36be-432a-9a54-334f91d1fe56';
UPDATE public.titles SET unlock_condition = 'Have a single transfer reversed by Staff.' WHERE id = 'bb10c5f2-3a14-4a41-9ea1-038ef164b13c';
UPDATE public.titles SET unlock_condition = 'Drop below 1 Aura within an hour of receiving a salary.' WHERE id = 'bac738fb-b8f3-45b3-8bef-b00d43281825';
UPDATE public.titles SET unlock_condition = 'Fail to start a game with 0 tickets 5 times.' WHERE id = 'f9c0ee97-0977-4dd3-a088-953cf8727428';

-- 2. Rarity rebalance
UPDATE public.titles SET tier = 'Common' WHERE text IN ('The Hoarder ', 'The Contributor ', 'The Revolutionary ');
UPDATE public.titles SET tier = 'Rare'   WHERE text IN ('The Influencer ', 'The Sender ', 'The Restricted ', 'The Dust ', 'The Spectator ', 'Awaiting-Trial ');
UPDATE public.titles SET tier = 'Epic'   WHERE text IN ('The Suspect ', 'The Escalator ', 'The Informant ', 'Gulag-Warden ');
UPDATE public.titles SET tier = 'Legendary' WHERE text IN ('The State Itself ');
UPDATE public.titles SET tier = 'Godlike'   WHERE text IN ('true dictator ');

-- 3. Track transfer reversals
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_by uuid;

-- 4. RPC: staff reverses a transfer (admin or owner only)
CREATE OR REPLACE FUNCTION public.staff_reverse_transfer(p_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_tx public.transactions%ROWTYPE;
  v_tax numeric;
  v_restricted_title uuid := 'bb10c5f2-3a14-4a41-9ea1-038ef164b13c';
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT highest_role(v_caller) INTO v_role;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Insufficient clearance'; END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_tx.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;

  v_tax := v_tx.amount_sent - v_tx.amount_received;

  -- Refund sender
  UPDATE public.profiles SET aura_balance = aura_balance + v_tx.amount_sent WHERE id = v_tx.sender_id;
  -- Take from receiver
  UPDATE public.profiles SET aura_balance = aura_balance - v_tx.amount_received WHERE id = v_tx.receiver_id;
  -- Pull tax back from the state bank
  IF v_tax > 0 THEN
    UPDATE public.aura_bank SET balance = balance - v_tax, updated_at = now() WHERE id = 1;
  END IF;

  UPDATE public.transactions SET reversed_at = now(), reversed_by = v_caller WHERE id = p_tx_id;

  -- Award "The Restricted" to the original sender
  INSERT INTO public.user_titles (user_id, title_id)
  VALUES (v_tx.sender_id, v_restricted_title)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_reverse_transfer(uuid) TO authenticated;
