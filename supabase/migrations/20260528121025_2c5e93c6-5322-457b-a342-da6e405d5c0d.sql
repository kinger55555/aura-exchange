-- Add state column for live game data
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Enable realtime
ALTER TABLE public.game_sessions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'game_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions';
  END IF;
END $$;

-- Override start_game_session to also seed RR state when game_type = russian_roulette
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not a member of this party';
  END IF;
  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_member_count < 3 THEN RAISE EXCEPTION 'Need at least 3 comrades'; END IF;

  -- Block if a session is already running for this party
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is already in progress for this party';
  END IF;

  SELECT * INTO v_week FROM public.game_weeks WHERE id = v_party.game_week_id;

  -- Consume one ticket
  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_week.id AND used_at IS NULL
      AND created_at >= date_trunc('day', now())
    LIMIT 1 FOR UPDATE;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'No tickets remaining today'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  -- Build random turn order from members
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

-- Helper: distribute payouts based on state
CREATE OR REPLACE FUNCTION public._rr_payout(
  p_session public.game_sessions,
  p_party public.parties,
  p_multiplier numeric,
  p_dissident uuid,
  p_exploded uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payout numeric;
BEGIN
  IF p_party.aura_bet <= 0 THEN RETURN; END IF;

  IF p_dissident IS NOT NULL THEN
    -- Refund all loyal members (dissident already paid bet)
    UPDATE public.profiles SET aura_balance = aura_balance + p_party.aura_bet
      WHERE id IN (
        SELECT user_id FROM public.party_members
        WHERE party_id = p_session.party_id AND user_id <> p_dissident
      );
  ELSIF p_exploded IS NOT NULL THEN
    -- Someone exploded: survivors get 0.5x their bet back
    v_payout := round(p_party.aura_bet * 0.5, 2);
    UPDATE public.profiles SET aura_balance = aura_balance + v_payout
      WHERE id IN (
        SELECT user_id FROM public.party_members
        WHERE party_id = p_session.party_id AND user_id <> p_exploded
      );
  ELSIF p_multiplier > 0 THEN
    -- Cash out: each member gets bet * multiplier
    v_payout := round(p_party.aura_bet * p_multiplier, 2);
    UPDATE public.profiles SET aura_balance = aura_balance + v_payout
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = p_session.party_id);
  END IF;
END;
$$;

-- Press the button
CREATE OR REPLACE FUNCTION public.rr_press(p_session_id uuid)
RETURNS game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_party public.parties;
  v_state jsonb;
  v_order jsonb;
  v_alive jsonb;
  v_idx int;
  v_current uuid;
  v_mult numeric;
  v_rot int;
  v_pir int;
  v_party_size int;
  v_chance numeric;
  v_exploded boolean;
  v_log jsonb;
  v_new_alive jsonb;
  v_new_idx int;
  v_now timestamptz := now();
  v_now_text text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'Shift already ended'; END IF;
  IF v_session.game_type <> 'russian_roulette' THEN RAISE EXCEPTION 'Wrong game type'; END IF;

  v_state := v_session.state;
  IF v_state->>'phase' <> 'playing' THEN RAISE EXCEPTION 'Not your turn'; END IF;

  v_order := v_state->'turn_order';
  v_alive := v_state->'alive';
  v_idx := (v_state->>'current_idx')::int;
  v_current := (v_alive->>v_idx)::uuid;
  IF v_current <> v_uid THEN RAISE EXCEPTION 'It is not your turn, comrade'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = v_session.party_id;
  SELECT count(*) INTO v_party_size FROM public.party_members WHERE party_id = v_session.party_id;

  v_mult := (v_state->>'multiplier')::numeric;
  v_rot := (v_state->>'rotations')::int;
  v_pir := (v_state->>'presses_in_rotation')::int;
  v_log := coalesce(v_state->'log', '[]'::jsonb);

  -- Detonation chance: starts ~1/6, scales up with party size and rotations
  v_chance := least(0.5, (1.0/6.0) + (v_rot * 0.04) + (greatest(v_party_size - 3, 0) * 0.02));
  v_exploded := random() < v_chance;

  v_log := v_log || jsonb_build_array(jsonb_build_object(
    'type', CASE WHEN v_exploded THEN 'detonate' ELSE 'safe' END,
    'user_id', v_uid,
    'at', v_now_text,
    'chance', round(v_chance, 3)
  ));

  IF v_exploded THEN
    -- Remove exploded comrade, end shift, payout
    v_new_alive := (SELECT jsonb_agg(elem) FROM jsonb_array_elements(v_alive) elem WHERE (elem)::text <> to_jsonb(v_uid)::text);
    v_state := v_state
      || jsonb_build_object(
        'phase', 'resolved',
        'alive', coalesce(v_new_alive, '[]'::jsonb),
        'exploded', to_jsonb(v_uid),
        'log', v_log,
        'last_action_at', v_now_text
      );
    UPDATE public.game_sessions
      SET status = 'completed', state = v_state,
          result_data = jsonb_build_object('multiplier', 0.5, 'exploded', v_uid)
      WHERE id = p_session_id RETURNING * INTO v_session;
    PERFORM public._rr_payout(v_session, v_party, 0, NULL, v_uid);
    RETURN v_session;
  END IF;

  -- Safe press: bump multiplier
  v_mult := round(v_mult + 0.2, 2);
  v_pir := v_pir + 1;
  v_new_idx := (v_idx + 1) % jsonb_array_length(v_alive);

  -- Did we complete a rotation?
  IF v_pir >= jsonb_array_length(v_alive) THEN
    v_rot := v_rot + 1;
    v_pir := 0;
    v_mult := round(v_mult + 0.5, 2); -- rotation bonus
    -- Enter voting phase (5 seconds to cash out)
    v_state := v_state || jsonb_build_object(
      'phase', 'voting',
      'multiplier', v_mult,
      'rotations', v_rot,
      'presses_in_rotation', 0,
      'current_idx', v_new_idx,
      'vote_deadline', to_char((v_now + interval '5 seconds') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'votes', '{}'::jsonb,
      'log', v_log,
      'last_action_at', v_now_text
    );
  ELSE
    v_state := v_state || jsonb_build_object(
      'multiplier', v_mult,
      'presses_in_rotation', v_pir,
      'current_idx', v_new_idx,
      'log', v_log,
      'last_action_at', v_now_text
    );
  END IF;

  UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

-- Vote during cash-out window
CREATE OR REPLACE FUNCTION public.rr_vote(p_session_id uuid, p_cash_out boolean)
RETURNS game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_party public.parties;
  v_state jsonb;
  v_alive jsonb;
  v_votes jsonb;
  v_mult numeric;
  v_now timestamptz := now();
  v_now_text text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_all_voted boolean;
  v_unanimous_cash boolean;
  v_deadline timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'Shift already ended'; END IF;

  v_state := v_session.state;
  IF v_state->>'phase' <> 'voting' THEN RAISE EXCEPTION 'No vote in progress'; END IF;
  v_alive := v_state->'alive';
  IF NOT (v_alive @> to_jsonb(v_uid)) THEN RAISE EXCEPTION 'You are not alive in this shift'; END IF;

  v_votes := coalesce(v_state->'votes', '{}'::jsonb) || jsonb_build_object(v_uid::text, p_cash_out);
  v_state := v_state || jsonb_build_object('votes', v_votes, 'last_action_at', v_now_text);

  v_deadline := (v_state->>'vote_deadline')::timestamptz;
  v_all_voted := (SELECT count(*) FROM jsonb_array_elements_text(v_alive)) =
                 (SELECT count(*) FROM jsonb_object_keys(v_votes));

  IF v_all_voted OR v_now >= v_deadline THEN
    -- Tally: unanimous cash out only if every alive voter said true
    v_unanimous_cash := v_all_voted AND NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(v_votes) WHERE value <> 'true'
    ) AND (SELECT count(*) FROM jsonb_object_keys(v_votes)) > 0;

    IF v_unanimous_cash THEN
      v_mult := (v_state->>'multiplier')::numeric;
      v_state := v_state || jsonb_build_object('phase', 'resolved', 'cashed_out', true);
      UPDATE public.game_sessions
        SET status = 'completed', state = v_state,
            result_data = jsonb_build_object('multiplier', v_mult, 'cashed_out', true)
        WHERE id = p_session_id RETURNING * INTO v_session;
      SELECT * INTO v_party FROM public.parties WHERE id = v_session.party_id;
      PERFORM public._rr_payout(v_session, v_party, v_mult, NULL, NULL);
      RETURN v_session;
    ELSE
      -- Resume playing
      v_state := v_state || jsonb_build_object('phase', 'playing', 'votes', '{}'::jsonb)
                          - 'vote_deadline';
    END IF;
  END IF;

  UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

-- Mark dissident (AFK)
CREATE OR REPLACE FUNCTION public.rr_mark_afk(p_session_id uuid)
RETURNS game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_party public.parties;
  v_state jsonb;
  v_alive jsonb;
  v_idx int;
  v_current uuid;
  v_last timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'Shift already ended'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_session.party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  v_state := v_session.state;
  v_last := (v_state->>'last_action_at')::timestamptz;
  IF now() - v_last < interval '15 seconds' THEN
    RAISE EXCEPTION 'Too soon — comrade still has time';
  END IF;

  -- Identify the dissident: whoever is currently expected to act
  IF v_state->>'phase' = 'playing' THEN
    v_alive := v_state->'alive';
    v_idx := (v_state->>'current_idx')::int;
    v_current := (v_alive->>v_idx)::uuid;
  ELSIF v_state->>'phase' = 'voting' THEN
    -- A non-voter among alive
    v_alive := v_state->'alive';
    SELECT (elem)::uuid INTO v_current
      FROM jsonb_array_elements_text(v_alive) elem
      WHERE NOT (coalesce(v_state->'votes', '{}'::jsonb) ? elem)
      LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Nothing to AFK from';
  END IF;

  IF v_current IS NULL THEN RAISE EXCEPTION 'No dissident found'; END IF;

  v_state := v_state || jsonb_build_object(
    'phase', 'resolved',
    'dissident', to_jsonb(v_current)
  );
  UPDATE public.game_sessions
    SET status = 'completed', state = v_state,
        result_data = jsonb_build_object('dissident', v_current)
    WHERE id = p_session_id RETURNING * INTO v_session;
  SELECT * INTO v_party FROM public.parties WHERE id = v_session.party_id;
  PERFORM public._rr_payout(v_session, v_party, 0, v_current, NULL);
  RETURN v_session;
END;
$$;

-- Make weekly game default to russian_roulette so it's playable now
CREATE OR REPLACE FUNCTION public.get_or_create_game_week()
RETURNS game_weeks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.game_weeks;
  v_start timestamptz := date_trunc('week', now());
  v_end timestamptz := v_start + interval '7 days';
BEGIN
  SELECT * INTO v_row FROM public.game_weeks WHERE starts_at = v_start LIMIT 1;
  IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;

  INSERT INTO public.game_weeks (week_label, game_name, game_type, starts_at, ends_at)
  VALUES (to_char(v_start, 'IYYY-"W"IW'), 'Russian Roulette', 'russian_roulette', v_start, v_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;