
-- ============== Schema changes ==============
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','special'));

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS max_players int,
  ADD COLUMN IF NOT EXISTS current_game text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_daily_ticket_at date,
  ADD COLUMN IF NOT EXISTS last_special_ticket_at date;

-- Allow members to delete themselves / owner to destroy / and inserts via RPC SECURITY DEFINER (no client policies needed)
-- Realtime on parties and party_members so the games tab can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;

-- ============== Game week defaults to Assembly Line ==============
CREATE OR REPLACE FUNCTION public.get_or_create_game_week()
RETURNS public.game_weeks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.game_weeks;
  v_start timestamptz := date_trunc('week', now());
  v_end timestamptz := v_start + interval '7 days';
BEGIN
  SELECT * INTO v_row FROM public.game_weeks WHERE starts_at = v_start LIMIT 1;
  IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;
  INSERT INTO public.game_weeks (week_label, game_name, game_type, starts_at, ends_at)
  VALUES (to_char(v_start, 'IYYY-"W"IW'), 'The Assembly Line', 'assembly_line', v_start, v_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============== Helper: am I in any active party? ==============
CREATE OR REPLACE FUNCTION public._user_active_party(p_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.party_id FROM public.party_members pm WHERE pm.user_id = p_uid LIMIT 1;
$$;

-- ============== create_party (with max_players, single-party enforcement) ==============
CREATE OR REPLACE FUNCTION public.create_party(
  p_name text,
  p_aura_bet numeric,
  p_password text DEFAULT NULL,
  p_max_players int DEFAULT NULL
)
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_profile.aura_balance < v_bet THEN RAISE EXCEPTION 'Insufficient Aura for the bet'; END IF;

  v_week := public.get_or_create_game_week();

  INSERT INTO public.parties (game_week_id, name, aura_bet, password, owner_id, max_players)
  VALUES (v_week.id, v_name, v_bet, v_pwd, v_uid, v_max)
  RETURNING * INTO v_row;

  INSERT INTO public.party_members (party_id, user_id) VALUES (v_row.id, v_uid);
  IF v_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_bet WHERE id = v_uid;
  END IF;
  RETURN v_row;
END;
$$;

-- ============== join_party (capacity + single-party) ==============
CREATE OR REPLACE FUNCTION public.join_party(p_party_id uuid, p_password text DEFAULT NULL)
RETURNS public.party_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_profile.aura_balance < v_party.aura_bet THEN RAISE EXCEPTION 'Insufficient Aura for the bet'; END IF;

  INSERT INTO public.party_members (party_id, user_id) VALUES (p_party_id, v_uid) RETURNING * INTO v_row;
  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_party.aura_bet WHERE id = v_uid;
  END IF;
  RETURN v_row;
END;
$$;

-- ============== destroy_party (owner only; refund all) ==============
CREATE OR REPLACE FUNCTION public.destroy_party(p_party_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_party.aura_bet
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = p_party_id);
  END IF;
  DELETE FROM public.party_members WHERE party_id = p_party_id;
  DELETE FROM public.parties WHERE id = p_party_id;
END;
$$;

-- ============== leave_party ==============
CREATE OR REPLACE FUNCTION public.leave_party(p_party_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_party.aura_bet WHERE id = v_uid;
  END IF;

  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_count = 0 THEN
    DELETE FROM public.parties WHERE id = p_party_id;
  ELSIF v_party.owner_id = v_uid THEN
    SELECT user_id INTO v_next_owner FROM public.party_members WHERE party_id = p_party_id ORDER BY joined_at LIMIT 1;
    UPDATE public.parties SET owner_id = v_next_owner WHERE id = p_party_id;
  END IF;
END;
$$;

-- ============== claim_tickets (daily + monthly) ==============
CREATE OR REPLACE FUNCTION public.claim_tickets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_rank public.ranks;
  v_week public.game_weeks;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_daily int := 0;
  v_special int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  SELECT * INTO v_rank FROM public.ranks WHERE rank = v_profile.current_rank;
  v_week := public.get_or_create_game_week();

  IF v_profile.last_daily_ticket_at IS DISTINCT FROM v_today THEN
    v_daily := coalesce(v_rank.tickets, 0);
    IF v_daily > 0 THEN
      INSERT INTO public.tickets (user_id, game_week_id, kind)
      SELECT v_uid, v_week.id, 'regular' FROM generate_series(1, v_daily);
    END IF;
    UPDATE public.profiles SET last_daily_ticket_at = v_today WHERE id = v_uid;
  END IF;

  IF v_profile.last_special_ticket_at IS NULL
     OR date_trunc('month', v_profile.last_special_ticket_at::timestamp)
        <> date_trunc('month', v_today::timestamp) THEN
    v_special := coalesce(v_rank.super_tickets, 0);
    IF v_special > 0 THEN
      INSERT INTO public.tickets (user_id, game_week_id, kind)
      SELECT v_uid, v_week.id, 'special' FROM generate_series(1, v_special);
    END IF;
    UPDATE public.profiles SET last_special_ticket_at = v_today WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('regular_granted', v_daily, 'special_granted', v_special);
END;
$$;

-- ============== buy_ticket ==============
CREATE OR REPLACE FUNCTION public.buy_ticket(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost numeric;
  v_profile public.profiles;
  v_week public.game_weeks;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_kind = 'regular' THEN v_cost := 5;
  ELSIF p_kind = 'special' THEN v_cost := 100;
  ELSE RAISE EXCEPTION 'Unknown ticket kind';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_profile.aura_balance < v_cost THEN RAISE EXCEPTION 'Insufficient Aura'; END IF;

  v_week := public.get_or_create_game_week();
  UPDATE public.profiles SET aura_balance = aura_balance - v_cost WHERE id = v_uid;
  INSERT INTO public.tickets (user_id, game_week_id, kind) VALUES (v_uid, v_week.id, p_kind);
END;
$$;

-- ============== swap_party_game (consumes special ticket) ==============
CREATE OR REPLACE FUNCTION public.swap_party_game(p_party_id uuid, p_game_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_ticket_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_game_type NOT IN ('assembly_line','reactor_core','synchronized_march') THEN
    RAISE EXCEPTION 'Unknown game';
  END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can swap the game'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress';
  END IF;

  SELECT id INTO v_ticket_id FROM public.tickets
    WHERE user_id = v_uid AND kind = 'special' AND used_at IS NULL
    ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_ticket_id IS NULL THEN RAISE EXCEPTION 'No special ticket available'; END IF;

  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket_id;
  UPDATE public.parties SET current_game = p_game_type WHERE id = p_party_id;
END;
$$;

-- ============== start_game_session (Assembly Line) ==============
CREATE OR REPLACE FUNCTION public.start_game_session(p_party_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_week public.game_weeks;
  v_count int;
  v_ticket_id uuid;
  v_state jsonb;
  v_now timestamptz := now();
  v_end timestamptz;
  v_game text;
  v_members jsonb;
  v_clicks jsonb := '{}'::jsonb;
  v_windows jsonb := '{}'::jsonb;
  m record;
  v_row public.game_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can start the shift'; END IF;

  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_count < 3 THEN RAISE EXCEPTION 'Need at least 3 comrades'; END IF;
  IF v_party.max_players IS NOT NULL AND v_count < v_party.max_players THEN
    RAISE EXCEPTION 'Party is not full yet';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is already in progress';
  END IF;

  -- Consume 1 regular ticket from owner
  SELECT id INTO v_ticket_id FROM public.tickets
    WHERE user_id = v_uid AND kind = 'regular' AND used_at IS NULL
    ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_ticket_id IS NULL THEN RAISE EXCEPTION 'Owner has no regular ticket'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket_id;

  v_week := public.get_or_create_game_week();
  v_game := coalesce(v_party.current_game, v_week.game_type, 'assembly_line');
  v_end := v_now + interval '60 seconds';

  -- Build per-member state: 10-second surge & jam windows within 60s
  FOR m IN SELECT user_id FROM public.party_members WHERE party_id = p_party_id LOOP
    v_clicks := v_clicks || jsonb_build_object(m.user_id::text, 0);
    v_windows := v_windows || jsonb_build_object(
      m.user_id::text,
      jsonb_build_object(
        'surge_start', floor(random()*50)::int,
        'jam_start',   floor(random()*50)::int
      )
    );
  END LOOP;

  v_state := jsonb_build_object(
    'game', v_game,
    'start_at', v_now,
    'end_at', v_end,
    'clicks', v_clicks,
    'windows', v_windows,
    'submitted', '{}'::jsonb
  );

  INSERT INTO public.game_sessions (party_id, game_type, status, state, aura_quota)
  VALUES (p_party_id, v_game, 'in_progress', v_state, v_party.aura_bet * v_count)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============== submit_assembly_clicks ==============
CREATE OR REPLACE FUNCTION public.submit_assembly_clicks(p_session_id uuid, p_clicks int)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_state jsonb;
  v_clicks int := greatest(coalesce(p_clicks, 0), 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RETURN v_session; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_session.party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;
  v_clicks := least(v_clicks, 2000); -- anti-cheat soft cap
  v_state := v_session.state;
  v_state := jsonb_set(v_state, ARRAY['clicks', v_uid::text], to_jsonb(v_clicks));
  v_state := jsonb_set(v_state, ARRAY['submitted', v_uid::text], to_jsonb(true));
  UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

-- ============== finalize_assembly ==============
CREATE OR REPLACE FUNCTION public.finalize_assembly(p_session_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.game_sessions;
  v_party public.parties;
  v_total int := 0;
  v_n int := 0;
  v_avg numeric;
  v_mult numeric := 0;
  v_payout numeric;
  v_state jsonb;
  v_row public.game_sessions;
  k text;
  v int;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RETURN v_session; END IF;
  IF (v_session.state->>'end_at')::timestamptz > now() THEN
    RAISE EXCEPTION 'The shift has not ended yet';
  END IF;

  v_state := v_session.state;
  FOR k, v IN SELECT key, (value)::text::int FROM jsonb_each_text(v_state->'clicks') AS t(key, value) LOOP
    v_total := v_total + v;
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN v_n := 1; END IF;
  v_avg := v_total::numeric / v_n;

  IF v_avg >= 480 THEN v_mult := 2.0;
  ELSIF v_avg >= 360 THEN v_mult := 1.5;
  ELSIF v_avg >= 240 THEN v_mult := 1.0;
  ELSE v_mult := 0.5;
  END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = v_session.party_id;
  v_payout := round(v_party.aura_bet * v_mult, 2);

  IF v_payout > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_payout
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = v_session.party_id);
  END IF;

  UPDATE public.game_sessions
    SET status = 'completed',
        result_data = jsonb_build_object(
          'avg', v_avg, 'total', v_total, 'players', v_n,
          'multiplier', v_mult, 'payout_per_player', v_payout
        )
    WHERE id = p_session_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============== Grants for new RPCs ==============
GRANT EXECUTE ON FUNCTION public.create_party(text, numeric, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.destroy_party(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_party(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_ticket(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_party_game(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assembly_clicks(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_assembly(uuid) TO authenticated;
