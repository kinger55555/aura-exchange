CREATE OR REPLACE FUNCTION public.send_aura(p_recipient text, p_amount numeric, p_message text DEFAULT NULL::text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sender public.profiles;
  v_receiver public.profiles;
  v_recent_sum numeric;
  v_limit numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
  v_rank public.ranks;
  v_next public.ranks;
  v_mult numeric;
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

  v_rank := public.get_rank_info(v_sender.current_rank);
  IF v_amount > v_rank.max_send THEN RAISE EXCEPTION 'Your rank caps transfers at % Aura', v_rank.max_send; END IF;
  v_mult := coalesce(v_rank.multiplier, 1.0);

  SELECT * INTO v_receiver FROM public.profiles WHERE lower(nickname) = lower(trim(p_recipient)) FOR UPDATE;
  IF v_receiver.id IS NULL THEN RAISE EXCEPTION 'The State does not recognize this comrade'; END IF;
  IF v_receiver.id = v_sender.id THEN RAISE EXCEPTION 'You cannot send Aura to yourself, comrade'; END IF;
  IF v_sender.aura_balance < v_amount THEN RAISE EXCEPTION 'Insufficient Aura, comrade'; END IF;

  SELECT coalesce(sum(amount_sent),0) INTO v_recent_sum FROM public.transactions
    WHERE sender_id = v_sender.id AND created_at > now() - interval '24 hours';

  -- Daily cap = (next rank upgrade cost) / 10
  v_next := public.get_rank_info(v_sender.current_rank + 1);
  v_limit := round(coalesce(v_next.upgrade_cost, 0) / 10.0, 2);
  IF v_recent_sum + v_amount > v_limit THEN
    RAISE EXCEPTION 'Transaction denied: daily limit exceeded (% / % Aura used)', v_recent_sum, v_limit;
  END IF;

  v_msg := nullif(trim(coalesce(p_message,'')),'');
  IF v_msg IS NOT NULL AND length(v_msg) > 200 THEN v_msg := left(v_msg,200); END IF;

  v_gross := v_amount * v_mult;
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
END;
$function$;