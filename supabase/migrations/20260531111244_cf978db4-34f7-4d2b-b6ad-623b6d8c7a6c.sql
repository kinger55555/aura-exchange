
-- 1. Drop overly permissive INSERT policies on parties / party_members (if any)
DROP POLICY IF EXISTS "Authenticated users can create parties" ON public.parties;
DROP POLICY IF EXISTS "Authenticated users can join parties" ON public.party_members;
REVOKE INSERT ON public.parties FROM authenticated, anon;
REVOKE INSERT ON public.party_members FROM authenticated, anon;

-- 2. Tighten bans: only own + staff can read
DROP POLICY IF EXISTS "bans readable by all authed" ON public.bans;
CREATE POLICY "bans own or staff" ON public.bans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

-- 3. Staff roles: hide weekly_salary column from regular users
REVOKE SELECT (weekly_salary, hired_by, hired_at) ON public.staff_roles FROM authenticated, anon;
GRANT SELECT (id, user_id, role) ON public.staff_roles TO authenticated;
-- Owners/admins still need full visibility via SECURITY DEFINER helpers; create one:
CREATE OR REPLACE FUNCTION public.list_staff_full()
RETURNS SETOF public.staff_roles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.staff_roles
  WHERE public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
$$;
REVOKE EXECUTE ON FUNCTION public.list_staff_full() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_full() TO authenticated;

-- 4. Parties: hide password column
REVOKE SELECT (password) ON public.parties FROM authenticated, anon;

-- 5. Cap penalty in act_on_report
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
    UPDATE public.profiles SET aura_balance = aura_balance - p_amount WHERE id = v_report.target_user_id;
    UPDATE public.reports SET status='resolved', resolved_by=v_uid, resolution='penalized:'||p_amount, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
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

-- 6. Lock down weekly payroll: owner-only + revoke from anon
CREATE OR REPLACE FUNCTION public.run_weekly_payroll()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := (date_trunc('week', (now() AT TIME ZONE 'UTC') - interval '7 days'))::date;
  v_week_end date := v_week_start + 7;
  r record; v_points int; v_prev_warning boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND public.highest_role(auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can run payroll';
  END IF;
  FOR r IN SELECT * FROM public.staff_roles WHERE role <> 'owner' LOOP
    SELECT count(*) INTO v_points FROM public.report_actions WHERE actor_id = r.user_id
      AND created_at >= v_week_start AND created_at < v_week_end;
    v_points := v_points + 2 * (SELECT count(*) FROM public.staff_checkins WHERE user_id = r.user_id AND day >= v_week_start AND day < v_week_end);

    IF v_points >= 10 THEN
      IF r.weekly_salary > 0 AND r.hired_by IS NOT NULL THEN
        UPDATE public.profiles SET aura_balance = aura_balance - r.weekly_salary WHERE id = r.hired_by;
        UPDATE public.profiles SET aura_balance = aura_balance + r.weekly_salary WHERE id = r.user_id;
      END IF;
    ELSE
      INSERT INTO public.staff_warnings (user_id, week_start, reason)
      VALUES (r.user_id, v_week_start, 'Failed weekly quota: '||v_points||'/10')
      ON CONFLICT DO NOTHING;
      v_prev_warning := EXISTS (SELECT 1 FROM public.staff_warnings WHERE user_id = r.user_id AND week_start = v_week_start - 7);
      IF v_prev_warning THEN
        DELETE FROM public.staff_roles WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.run_weekly_payroll() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_weekly_payroll() TO service_role;

-- 7. Fix submit_report target bug
CREATE OR REPLACE FUNCTION public.submit_report(p_type text, p_target_nickname text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target_id uuid;
  v_queue text;
  v_priority int := 2;
  v_row public.reports;
  v_fee numeric := 0;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) AND p_type <> 'ban_appeal' THEN
    RAISE EXCEPTION 'You are banned and cannot file reports';
  END IF;

  IF p_target_nickname IS NOT NULL THEN
    SELECT id INTO v_target_id FROM public.profiles WHERE lower(nickname) = lower(trim(p_target_nickname));
    IF v_target_id IS NULL THEN RAISE EXCEPTION 'Target comrade not found'; END IF;
  END IF;

  IF p_type = 'player_report' THEN v_queue := 'mod'; v_fee := 0.5;
  ELSIF p_type = 'mod_report' THEN v_queue := 'admin'; v_priority := 1;
  ELSIF p_type = 'auraguard' THEN v_queue := 'mod'; v_priority := 1;
  ELSIF p_type = 'aura_appeal' THEN v_queue := 'admin';
  ELSIF p_type = 'ban_appeal' THEN v_queue := 'owner';
  ELSIF p_type = 'admin_escalation' THEN v_queue := 'owner'; v_priority := 1;
  ELSIF p_type IN ('feature_idea','minigame_idea') THEN v_queue := 'owner'; v_priority := 3;
  ELSE RAISE EXCEPTION 'Unknown report type %', p_type;
  END IF;

  IF v_fee > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_fee
      WHERE id = v_uid AND aura_balance >= v_fee;
    GET DIAGNOSTICS v_ok = ROW_COUNT;
    IF NOT v_ok THEN RAISE EXCEPTION 'Insufficient Aura for the filing fee (% required)', v_fee; END IF;
  END IF;

  INSERT INTO public.reports (type, priority, queue, reporter_id, target_user_id, payload)
  VALUES (p_type, v_priority, v_queue, v_uid, v_target_id,
          coalesce(p_extra,'{}'::jsonb) || jsonb_build_object('message', p_message))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
