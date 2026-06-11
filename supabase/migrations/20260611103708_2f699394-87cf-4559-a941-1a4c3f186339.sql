
CREATE OR REPLACE FUNCTION public.submit_assembly_clicks(p_session_id uuid, p_clicks integer)
 RETURNS game_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_state jsonb;
  v_clicks int := greatest(coalesce(p_clicks, 0), 0);
  v_start timestamptz;
  v_end timestamptz;
  v_dur_sec int;
  v_cap int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RETURN v_session; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_session.party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Enforce one submission per user per session
  IF coalesce((v_session.state->'submitted'->>v_uid::text)::boolean, false) THEN
    RAISE EXCEPTION 'You have already submitted your shift';
  END IF;

  -- Anti-cheat: max 10 clicks/second of the shift duration
  v_start := (v_session.state->>'start_at')::timestamptz;
  v_end := (v_session.state->>'end_at')::timestamptz;
  v_dur_sec := greatest(1, extract(epoch from (v_end - v_start))::int);
  v_cap := v_dur_sec * 10;
  IF v_clicks > v_cap THEN v_clicks := v_cap; END IF;

  v_state := v_session.state;
  v_state := jsonb_set(v_state, ARRAY['clicks', v_uid::text], to_jsonb(v_clicks));
  v_state := jsonb_set(v_state, ARRAY['submitted', v_uid::text], to_jsonb(true));
  UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.burn_aura(p_keep numeric)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_keep numeric := round(coalesce(p_keep, 0)::numeric, 2);
  v_burn numeric;
  v_bank numeric;
  v_floor int;
  v_owner_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_keep < 0 THEN RAISE EXCEPTION 'Keep amount must be >= 0'; END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_me.id IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_keep > v_me.aura_balance THEN RAISE EXCEPTION 'Cannot keep more than you have'; END IF;

  v_burn := v_me.aura_balance - v_keep;
  IF v_burn <= 0 THEN RAISE EXCEPTION 'Nothing to burn, comrade'; END IF;

  UPDATE public.profiles SET aura_balance = v_keep WHERE id = v_uid RETURNING * INTO v_me;

  UPDATE public.aura_bank SET balance = balance + v_burn, updated_at = now() WHERE id = 1
    RETURNING balance INTO v_bank;
  IF v_bank >= 1 THEN
    v_floor := floor(v_bank)::int;
    SELECT sr.user_id INTO v_owner_id FROM public.staff_roles sr
      WHERE sr.role = 'owner' ORDER BY sr.hired_at ASC LIMIT 1;
    IF v_owner_id IS NOT NULL THEN
      UPDATE public.profiles SET aura_balance = aura_balance + v_floor WHERE id = v_owner_id;
      UPDATE public.aura_bank SET balance = balance - v_floor, updated_at = now() WHERE id = 1;
    END IF;
  END IF;

  RETURN v_me;
END;
$function$;

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
      SELECT sr.user_id INTO v_owner_id FROM public.staff_roles sr
        WHERE sr.role = 'owner' ORDER BY sr.hired_at ASC LIMIT 1;
      IF v_owner_id IS NOT NULL THEN
        UPDATE public.profiles SET aura_balance = aura_balance + v_floor WHERE id = v_owner_id;
        UPDATE public.aura_bank SET balance = balance - v_floor, updated_at = now() WHERE id = 1;
      END IF;
    END IF;
  END IF;

  RETURN v_sender;
END;
$function$;
