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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id;
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

  SELECT * INTO v_week FROM public.game_weeks WHERE id = v_party.game_week_id;

  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_week.id AND used_at IS NULL
      AND created_at >= date_trunc('day', now())
    LIMIT 1 FOR UPDATE;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'No tickets remaining today'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  SELECT jsonb_agg(user_id ORDER BY random())
    INTO v_order
    FROM public.party_members WHERE party_id = p_party_id;

  v_state := jsonb_build_object(
    'phase', 'playing',
    'turn_order', v_order,
    'alive', v_order,
    'current_idx', 0,
    'multiplier', 1.0,
    'rotations', 0,
    'presses_in_rotation', 0,
    'last_action_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'log', '[]'::jsonb
  );

  INSERT INTO public.game_sessions (party_id, game_type, aura_quota, state)
  VALUES (p_party_id, v_week.game_type, v_party.aura_bet * v_member_count, v_state)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;