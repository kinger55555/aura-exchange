
-- 1) PARTIES: keep broad SELECT on non-sensitive columns, hide password column.
REVOKE SELECT (password) ON public.parties FROM anon, authenticated;
-- (Owner/staff read passwords via SECURITY DEFINER helpers if needed.)

-- 2) STAFF_ROLES: hide sensitive columns from regular users (idempotent).
REVOKE SELECT (weekly_salary, hired_by, hired_at) ON public.staff_roles FROM anon, authenticated;
GRANT SELECT (id, user_id, role) ON public.staff_roles TO authenticated;

-- 3) TRANSACTIONS: own-rows + staff only
DROP POLICY IF EXISTS "Transactions viewable by authenticated users" ON public.transactions;
CREATE POLICY "Transactions own or staff" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

-- 4) finalize_assembly: require caller to be a party member
CREATE OR REPLACE FUNCTION public.finalize_assembly(p_session_id uuid)
RETURNS game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id = v_session.party_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;
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
$function$;
