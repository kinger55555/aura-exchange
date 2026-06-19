
-- create_party: don't deduct bet
CREATE OR REPLACE FUNCTION public.create_party(p_name text, p_aura_bet numeric, p_password text DEFAULT NULL::text, p_max_players integer DEFAULT NULL::integer)
 RETURNS parties
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_week public.game_weeks;
  v_name text := trim(p_name);
  v_bet numeric := round(coalesce(p_aura_bet, 0)::numeric, 2);
  v_pwd text := nullif(trim(coalesce(p_password, '')), '');
  v_max int := p_max_players;
  v_row public.parties;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 30 THEN RAISE EXCEPTION 'Party name must be 2-30 characters'; END IF;
  IF v_bet < 0 OR v_bet > 100 THEN RAISE EXCEPTION 'Aura bet must be 0-100'; END IF;
  IF v_max IS NOT NULL AND v_max < 3 THEN RAISE EXCEPTION 'Max players must be at least 3 (or leave empty for no limit)'; END IF;
  IF public._user_active_party(v_uid) IS NOT NULL THEN RAISE EXCEPTION 'You are already in a party — leave it first'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_profile.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;

  v_week := public.get_or_create_game_week();

  INSERT INTO public.parties (game_week_id, name, aura_bet, password, owner_id, max_players)
  VALUES (v_week.id, v_name, v_bet, v_pwd, v_uid, v_max)
  RETURNING * INTO v_row;

  INSERT INTO public.party_members (party_id, user_id) VALUES (v_row.id, v_uid);
  RETURN v_row;
END;
$function$;

-- join_party: don't deduct bet
CREATE OR REPLACE FUNCTION public.join_party(p_party_id uuid, p_password text DEFAULT NULL::text)
 RETURNS party_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_profile public.profiles;
  v_row public.party_members;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public._user_active_party(v_uid) IS NOT NULL THEN RAISE EXCEPTION 'You are already in a party — leave it first'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.password IS NOT NULL AND v_party.password <> coalesce(p_password, '') THEN
    RAISE EXCEPTION 'Incorrect password';
  END IF;

  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_party.max_players IS NOT NULL AND v_count >= v_party.max_players THEN
    RAISE EXCEPTION 'Party is full';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_profile.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;

  INSERT INTO public.party_members (party_id, user_id) VALUES (p_party_id, v_uid) RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- destroy_party: no refunds (nothing was charged)
CREATE OR REPLACE FUNCTION public.destroy_party(p_party_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can destroy this party'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress — finish it first';
  END IF;

  DELETE FROM public.party_members WHERE party_id = p_party_id;
  DELETE FROM public.parties WHERE id = p_party_id;
END;
$function$;

-- leave_party: no refund
CREATE OR REPLACE FUNCTION public.leave_party(p_party_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_count int;
  v_next_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not in this party';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress — finish it first';
  END IF;

  DELETE FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid;

  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_count = 0 THEN
    DELETE FROM public.parties WHERE id = p_party_id;
  ELSIF v_party.owner_id = v_uid THEN
    SELECT user_id INTO v_next_owner FROM public.party_members WHERE party_id = p_party_id ORDER BY joined_at LIMIT 1;
    UPDATE public.parties SET owner_id = v_next_owner WHERE id = p_party_id;
  END IF;
END;
$function$;

-- kick_member: no refund
CREATE OR REPLACE FUNCTION public.kick_member(p_party_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can kick members'; END IF;
  IF p_user_id = v_party.owner_id THEN RAISE EXCEPTION 'You cannot kick yourself'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress — finish it first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'That comrade is not in the party';
  END IF;

  DELETE FROM public.party_members WHERE party_id = p_party_id AND user_id = p_user_id;
END;
$function$;

-- kick_all_members: no refunds
CREATE OR REPLACE FUNCTION public.kick_all_members(p_party_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can kick members'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress — finish it first';
  END IF;

  DELETE FROM public.party_members WHERE party_id = p_party_id AND user_id <> v_party.owner_id;
END;
$function$;

-- start_game_session: charge every member their bet now
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

  -- Verify every member can afford the bet
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

  -- Consume a ticket
  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND used_at IS NULL AND kind = 'regular'
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE;
  IF v_ticket.id IS NULL THEN
    SELECT * INTO v_ticket FROM public.tickets
      WHERE user_id = v_uid AND used_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1 FOR UPDATE;
  END IF;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'No tickets remaining'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  -- Charge bets now
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
