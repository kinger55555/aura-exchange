
CREATE OR REPLACE FUNCTION public.denounce_comrade(p_recipient text, p_amount numeric, p_reason text DEFAULT NULL::text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_target public.profiles;
  v_amt numeric := round(p_amount::numeric, 2);
  v_msg text;
  v_rank public.ranks;
  v_cap numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_me.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;

  v_rank := public.get_rank_info(v_me.current_rank);
  v_cap := round(coalesce(v_rank.max_send, 0) / 2.0, 2);
  IF v_cap <= 0 THEN RAISE EXCEPTION 'Your rank cannot denounce yet'; END IF;
  IF v_amt > v_cap THEN RAISE EXCEPTION 'Your rank caps denouncements at % Aura', v_cap; END IF;

  IF v_me.aura_balance < v_amt THEN RAISE EXCEPTION 'Insufficient Aura to denounce'; END IF;

  SELECT * INTO v_target FROM public.profiles
    WHERE lower(nickname) = lower(trim(p_recipient)) FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'The State does not recognize this comrade'; END IF;
  IF v_target.id = v_me.id THEN RAISE EXCEPTION 'You cannot denounce yourself, comrade'; END IF;

  v_msg := nullif(trim(coalesce(p_reason, '')), '');
  IF v_msg IS NOT NULL AND length(v_msg) > 200 THEN v_msg := left(v_msg, 200); END IF;
  v_msg := '⚡ Denounced' || coalesce(': ' || v_msg, '');

  UPDATE public.profiles SET aura_balance = aura_balance - v_amt
    WHERE id = v_me.id RETURNING * INTO v_me;
  UPDATE public.profiles SET aura_balance = aura_balance - v_amt
    WHERE id = v_target.id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    VALUES (v_me.id, v_target.id, v_amt, -v_amt, v_msg);

  RETURN v_me;
END;
$function$;
