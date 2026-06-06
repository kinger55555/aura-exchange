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
$$;