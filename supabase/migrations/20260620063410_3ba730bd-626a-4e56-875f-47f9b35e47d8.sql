
CREATE OR REPLACE FUNCTION public.start_game_session(p_party_id uuid)
 RETURNS game_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_week public.game_weeks;
  v_member_count int;
  v_ticket public.tickets;
  v_row public.game_sessions;
  v_order jsonb;
  v_state jsonb;
  v_is_owner boolean;
  v_game text;
  v_now timestamptz := now();
  v_end timestamptz;
  v_windows jsonb := '{}'::jsonb;
  v_member record;
  v_surge int;
  v_jam int;
  v_short_nick text;
  v_first_holder uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not a member of this party';
  END IF;

  v_is_owner := EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = v_uid AND role = 'owner');

  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_member_count < 3 AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Need at least 3 comrades';
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is already in progress for this party';
  END IF;

  IF v_party.aura_bet > 0 THEN
    SELECT p.nickname INTO v_short_nick
    FROM public.party_members pm
    JOIN public.profiles p ON p.id = pm.user_id
    WHERE pm.party_id = p_party_id AND p.aura_balance < v_party.aura_bet
    LIMIT 1;
    IF v_short_nick IS NOT NULL THEN
      RAISE EXCEPTION '% does not have enough Aura for the bet', v_short_nick;
    END IF;
  END IF;

  SELECT * INTO v_week FROM public.game_weeks WHERE id = v_party.game_week_id;
  v_game := COALESCE(v_party.current_game, v_week.game_type);

  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND used_at IS NULL AND kind = 'regular'
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  IF v_ticket.id IS NULL THEN
    SELECT * INTO v_ticket FROM public.tickets
      WHERE user_id = v_uid AND used_at IS NULL
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'No tickets remaining'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_party.aura_bet
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = p_party_id);
  END IF;

  SELECT jsonb_agg(user_id ORDER BY random())
    INTO v_order
    FROM public.party_members WHERE party_id = p_party_id;

  IF v_game = 'assembly_line' THEN
    v_end := v_now + interval '60 seconds';
    FOR v_member IN SELECT user_id FROM public.party_members WHERE party_id = p_party_id LOOP
      v_surge := floor(random() * 20)::int;
      v_jam   := 30 + floor(random() * 20)::int;
      v_windows := v_windows || jsonb_build_object(
        v_member.user_id::text,
        jsonb_build_object('surge_start', v_surge, 'jam_start', v_jam)
      );
    END LOOP;
    v_state := jsonb_build_object(
      'phase', 'playing',
      'start_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'end_at',   to_char(v_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'windows', v_windows,
      'clicks', '{}'::jsonb,
      'turn_order', v_order
    );
  ELSIF v_game = 'reactor_core' THEN
    v_end := v_now + interval '90 seconds';
    v_first_holder := (v_order->>0)::uuid;
    v_state := jsonb_build_object(
      'phase', 'playing',
      'start_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'end_at',   to_char(v_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'turn_order', v_order,
      'first_holder', v_first_holder
    );
  ELSE
    v_state := jsonb_build_object(
      'phase', 'playing',
      'turn_order', v_order,
      'alive', v_order,
      'current_idx', 0,
      'multiplier', 1.0,
      'rotations', 0,
      'presses_in_rotation', 0,
      'last_action_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'log', '[]'::jsonb
    );
  END IF;

  INSERT INTO public.game_sessions (party_id, game_type, aura_quota, state)
  VALUES (p_party_id, v_game, v_party.aura_bet * v_member_count, v_state)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- Finalize Reactor Core: clamp claimed survived seconds by real elapsed wall time,
-- compute payout tier, and credit each member.
CREATE OR REPLACE FUNCTION public.finalize_reactor(p_session_id uuid, p_survived_seconds int)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sess public.game_sessions;
  v_party public.parties;
  v_start timestamptz;
  v_elapsed int;
  v_seconds int;
  v_mult numeric;
  v_member_count int;
  v_payout numeric;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_sess FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_sess.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_sess.status <> 'in_progress' THEN
    RETURN COALESCE(v_sess.result_data, '{}'::jsonb);
  END IF;
  IF v_sess.game_type <> 'reactor_core' THEN RAISE EXCEPTION 'Wrong game type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_sess.party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not a member of this party';
  END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = v_sess.party_id;
  v_start := (v_sess.state->>'start_at')::timestamptz;
  v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_start))::int);
  v_seconds := LEAST(GREATEST(p_survived_seconds, 0), v_elapsed, 90);

  IF v_seconds >= 90 THEN v_mult := 2.0;
  ELSIF v_seconds >= 60 THEN v_mult := 1.0;
  ELSIF v_seconds >= 30 THEN v_mult := 0.5;
  ELSE v_mult := 0.0;
  END IF;

  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = v_sess.party_id;
  v_payout := round((v_party.aura_bet * v_mult)::numeric, 2);

  IF v_payout > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_payout
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = v_sess.party_id);
  END IF;

  v_result := jsonb_build_object(
    'survived_seconds', v_seconds,
    'multiplier', v_mult,
    'payout_per_player', v_payout,
    'exploded', v_seconds < 90
  );

  UPDATE public.game_sessions
    SET status = 'completed', result_data = v_result, ended_at = now()
    WHERE id = p_session_id;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_reactor(uuid, int) TO authenticated;
