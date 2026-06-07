
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
  v_current numeric;
  v_actual numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role := public.highest_role(v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not staff'; END IF;
  IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot punish yourself'; END IF;
  v_cap := CASE v_role WHEN 'moderator' THEN 10 WHEN 'admin' THEN 50 ELSE 100 END;
  IF v_amt > v_cap THEN RAISE EXCEPTION 'Penalty exceeds your role cap of % Aura', v_cap; END IF;

  SELECT aura_balance INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;

  -- Cap deduction at current balance so the target never goes negative
  v_actual := LEAST(v_amt, GREATEST(v_current, 0));

  UPDATE public.profiles SET aura_balance = aura_balance - v_actual
    WHERE id = p_user_id RETURNING * INTO v_target;

  -- Deducter receives nothing; aura is burned
  INSERT INTO public.reports (type, priority, queue, reporter_id, target_user_id, payload, status, resolved_by, resolved_at, resolution)
  VALUES ('auraguard', 2, 'mod', v_uid, p_user_id,
          jsonb_build_object('source','profile_punish','amount', v_actual, 'requested', v_amt, 'reason', p_reason),
          'resolved', v_uid, now(), 'penalized:'||v_actual);
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.act_on_report(p_report_id uuid, p_action text, p_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_role public.staff_role;
  v_cap numeric;
  v_current numeric;
  v_actual numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role := public.highest_role(v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not staff'; END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status <> 'open' THEN RAISE EXCEPTION 'Already closed'; END IF;

  IF v_report.queue = 'mod' AND v_role NOT IN ('moderator','admin','owner') THEN RAISE EXCEPTION 'Not your queue'; END IF;
  IF v_report.queue = 'admin' AND v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Not your queue'; END IF;
  IF v_report.queue = 'owner' AND v_role <> 'owner' THEN RAISE EXCEPTION 'Not your queue'; END IF;

  IF p_action = 'penalize' AND v_report.target_user_id IS NOT NULL AND p_amount > 0 THEN
    v_cap := CASE v_role WHEN 'moderator' THEN 10 WHEN 'admin' THEN 50 ELSE 100 END;
    IF p_amount > v_cap THEN RAISE EXCEPTION 'Penalty exceeds your role cap of % Aura', v_cap; END IF;
    SELECT aura_balance INTO v_current FROM public.profiles WHERE id = v_report.target_user_id FOR UPDATE;
    v_actual := LEAST(p_amount, GREATEST(coalesce(v_current,0), 0));
    UPDATE public.profiles SET aura_balance = aura_balance - v_actual WHERE id = v_report.target_user_id;
    -- Deducter receives nothing; aura is burned
    UPDATE public.reports SET status='resolved', resolved_by=v_uid, resolution='penalized:'||v_actual, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
  ELSIF p_action = 'dismiss' THEN
    UPDATE public.reports SET status='dismissed', resolved_by=v_uid, resolution=p_notes, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
  ELSIF p_action = 'escalate' THEN
    UPDATE public.reports SET
      queue = CASE queue WHEN 'mod' THEN 'admin' WHEN 'admin' THEN 'owner' ELSE 'owner' END,
      priority = 1
    WHERE id = p_report_id RETURNING * INTO v_report;
  ELSIF p_action = 'resolve' THEN
    UPDATE public.reports SET status='resolved', resolved_by=v_uid, resolution=p_notes, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  INSERT INTO public.report_actions (report_id, actor_id, action, notes)
  VALUES (p_report_id, v_uid, p_action, p_notes);
  RETURN v_report;
END;
$function$;
