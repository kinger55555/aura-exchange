CREATE OR REPLACE FUNCTION public.staff_punish(p_user_id uuid, p_amount numeric, p_reason text DEFAULT NULL)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.staff_role;
  v_cap numeric;
  v_amt numeric := round(p_amount::numeric, 2);
  v_target public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role := public.highest_role(v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not staff'; END IF;
  IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot punish yourself'; END IF;
  v_cap := CASE v_role WHEN 'moderator' THEN 10 WHEN 'admin' THEN 50 ELSE 100 END;
  IF v_amt > v_cap THEN RAISE EXCEPTION 'Penalty exceeds your role cap of % Aura', v_cap; END IF;

  UPDATE public.profiles SET aura_balance = aura_balance - v_amt
    WHERE id = p_user_id RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;

  INSERT INTO public.reports (type, priority, queue, reporter_id, target_user_id, payload, status, resolved_by, resolved_at, resolution)
  VALUES ('auraguard', 2, 'mod', v_uid, p_user_id,
          jsonb_build_object('source','profile_punish','amount', v_amt, 'reason', p_reason),
          'resolved', v_uid, now(), 'penalized:'||v_amt);
  RETURN v_target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_punish(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_punish(uuid, numeric, text) TO authenticated, service_role;