
-- ============ ROLES ============
CREATE TYPE public.staff_role AS ENUM ('owner', 'admin', 'moderator');

CREATE TABLE public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  hired_by uuid REFERENCES public.profiles(id),
  weekly_salary numeric NOT NULL DEFAULT 0,
  hired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_roles readable by all authed" ON public.staff_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.staff_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.highest_role(_user_id uuid)
RETURNS public.staff_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.staff_roles WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
$$;

-- Seed David as Owner
INSERT INTO public.staff_roles (user_id, role, weekly_salary)
SELECT id, 'owner', 0 FROM public.profiles WHERE lower(nickname) = 'david'
ON CONFLICT DO NOTHING;

-- ============ BANS ============
CREATE TABLE public.bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  issued_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text,
  expires_at timestamptz, -- null = permanent
  status text NOT NULL DEFAULT 'active', -- active | lifted | appealed
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bans TO authenticated;
GRANT ALL ON public.bans TO service_role;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bans readable by all authed" ON public.bans FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bans
    WHERE user_id = _user_id AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- ============ REPORTS ============
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- player_report|mod_report|auraguard|aura_appeal|ban_appeal|feature_idea|minigame_idea|admin_escalation
  priority int NOT NULL DEFAULT 2, -- 1 highest, 3 lowest
  queue text NOT NULL, -- mod | admin | owner
  reporter_id uuid REFERENCES public.profiles(id),
  target_user_id uuid REFERENCES public.profiles(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open', -- open | resolved | escalated | dismissed
  resolved_by uuid REFERENCES public.profiles(id),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_reports_queue_status ON public.reports(queue, status, priority, created_at);
GRANT SELECT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports staff or own" ON public.reports FOR SELECT TO authenticated
USING (
  reporter_id = auth.uid()
  OR target_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'moderator')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
);

CREATE TABLE public.report_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_actions TO authenticated;
GRANT ALL ON public.report_actions TO service_role;
ALTER TABLE public.report_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_actions staff" ON public.report_actions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE public.staff_checkins (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
GRANT SELECT ON public.staff_checkins TO authenticated;
GRANT ALL ON public.staff_checkins TO service_role;
ALTER TABLE public.staff_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checkins" ON public.staff_checkins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.staff_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);
GRANT SELECT ON public.staff_warnings TO authenticated;
GRANT ALL ON public.staff_warnings TO service_role;
ALTER TABLE public.staff_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own warnings or staff" ON public.staff_warnings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

-- ============ RPCs ============

-- Submit a report (generic)
CREATE OR REPLACE FUNCTION public.submit_report(
  p_type text,
  p_target_nickname text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS public.reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_queue text;
  v_priority int := 2;
  v_row public.reports;
  v_fee numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) AND p_type <> 'ban_appeal' THEN
    RAISE EXCEPTION 'You are banned and cannot file reports';
  END IF;

  IF p_target_nickname IS NOT NULL THEN
    SELECT * INTO v_target FROM public.profiles WHERE lower(nickname) = lower(trim(p_target_nickname));
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'Target comrade not found'; END IF;
  END IF;

  -- Route + priority
  IF p_type = 'player_report' THEN
    v_queue := 'mod'; v_fee := 0.5;
  ELSIF p_type = 'mod_report' THEN
    v_queue := 'admin'; v_priority := 1;
  ELSIF p_type = 'auraguard' THEN
    v_queue := 'mod'; v_priority := 1;
  ELSIF p_type = 'aura_appeal' THEN
    v_queue := 'admin'; v_priority := 2;
  ELSIF p_type = 'ban_appeal' THEN
    v_queue := 'owner'; v_priority := 2;
  ELSIF p_type = 'admin_escalation' THEN
    v_queue := 'owner'; v_priority := 1;
  ELSIF p_type IN ('feature_idea','minigame_idea') THEN
    v_queue := 'owner'; v_priority := 3;
  ELSE
    RAISE EXCEPTION 'Unknown report type %', p_type;
  END IF;

  -- Charge anti-spam fee
  IF v_fee > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_fee
      WHERE id = v_uid AND aura_balance >= v_fee
      RETURNING id INTO v_target.id; -- reuse var; throw if not enough
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient Aura for the filing fee (% required)', v_fee; END IF;
  END IF;

  INSERT INTO public.reports (type, priority, queue, reporter_id, target_user_id, payload)
  VALUES (p_type, v_priority, v_queue, v_uid, v_target.id,
          coalesce(p_extra,'{}'::jsonb) || jsonb_build_object('message', p_message))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Act on report (resolve / dismiss / penalize / escalate)
CREATE OR REPLACE FUNCTION public.act_on_report(
  p_report_id uuid,
  p_action text, -- penalize | dismiss | escalate | resolve
  p_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS public.reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_role public.staff_role;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role := public.highest_role(v_uid);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not staff'; END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status <> 'open' THEN RAISE EXCEPTION 'Already closed'; END IF;

  -- Queue gate
  IF v_report.queue = 'mod' AND v_role NOT IN ('moderator','admin','owner') THEN RAISE EXCEPTION 'Not your queue'; END IF;
  IF v_report.queue = 'admin' AND v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Not your queue'; END IF;
  IF v_report.queue = 'owner' AND v_role <> 'owner' THEN RAISE EXCEPTION 'Not your queue'; END IF;

  IF p_action = 'penalize' AND v_report.target_user_id IS NOT NULL AND p_amount > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - p_amount WHERE id = v_report.target_user_id;
    UPDATE public.reports SET status='resolved', resolved_by=v_uid, resolution='penalized:'||p_amount, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
  ELSIF p_action = 'dismiss' THEN
    UPDATE public.reports SET status='dismissed', resolved_by=v_uid, resolution=p_notes, resolved_at=now() WHERE id=p_report_id RETURNING * INTO v_report;
  ELSIF p_action = 'escalate' THEN
    -- bump to next queue
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
$$;

-- Hire / fire staff
CREATE OR REPLACE FUNCTION public.hire_staff(p_nickname text, p_role public.staff_role, p_salary numeric)
RETURNS public.staff_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role public.staff_role := public.highest_role(v_uid);
  v_target public.profiles;
  v_row public.staff_roles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_role = 'admin' AND v_actor_role <> 'owner' THEN RAISE EXCEPTION 'Only the Owner hires Admins'; END IF;
  IF p_role = 'moderator' AND v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Only Admins hire Mods'; END IF;
  IF p_role = 'owner' THEN RAISE EXCEPTION 'Owner cannot be appointed'; END IF;
  IF p_salary < 0 OR p_salary > 1000 THEN RAISE EXCEPTION 'Salary must be 0-1000'; END IF;

  SELECT * INTO v_target FROM public.profiles WHERE lower(nickname) = lower(trim(p_nickname));
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;

  INSERT INTO public.staff_roles (user_id, role, hired_by, weekly_salary)
  VALUES (v_target.id, p_role, v_uid, p_salary)
  ON CONFLICT (user_id, role) DO UPDATE SET hired_by = EXCLUDED.hired_by, weekly_salary = EXCLUDED.weekly_salary
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.fire_staff(p_user_id uuid, p_role public.staff_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role public.staff_role := public.highest_role(v_uid);
  v_target public.staff_roles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_target FROM public.staff_roles WHERE user_id = p_user_id AND role = p_role;
  IF v_target.id IS NULL THEN RETURN; END IF;
  IF p_role = 'admin' AND v_actor_role <> 'owner' THEN RAISE EXCEPTION 'Only the Owner fires Admins'; END IF;
  IF p_role = 'moderator' AND v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Insufficient privilege'; END IF;
  IF p_role = 'owner' THEN RAISE EXCEPTION 'Cannot fire the Owner'; END IF;
  DELETE FROM public.staff_roles WHERE id = v_target.id;
END;
$$;

-- Ban / lift
CREATE OR REPLACE FUNCTION public.issue_ban(p_user_id uuid, p_reason text, p_days int DEFAULT NULL)
RETURNS public.bans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_role public.staff_role := public.highest_role(v_uid);
  v_exp timestamptz := NULL;
  v_row public.bans;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Insufficient privilege'; END IF;
  IF p_days IS NOT NULL THEN
    IF v_actor_role = 'admin' AND (p_days < 1 OR p_days > 7) THEN RAISE EXCEPTION 'Admins can only ban for 1-7 days'; END IF;
    v_exp := now() + (p_days || ' days')::interval;
  ELSE
    IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'Only the Owner issues permanent bans'; END IF;
  END IF;
  INSERT INTO public.bans (user_id, issued_by, reason, expires_at)
  VALUES (p_user_id, v_uid, p_reason, v_exp) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.lift_ban(p_ban_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_role public.staff_role := public.highest_role(v_uid);
BEGIN
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Insufficient privilege'; END IF;
  UPDATE public.bans SET status = 'lifted' WHERE id = p_ban_id;
END;
$$;

-- Staff check-in
CREATE OR REPLACE FUNCTION public.staff_checkin()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.staff_role := public.highest_role(v_uid);
  v_open int;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not staff'; END IF;
  SELECT count(*) INTO v_open FROM public.reports
    WHERE status='open' AND (
      (v_role='moderator' AND queue='mod') OR
      (v_role='admin' AND queue IN ('mod','admin')) OR
      (v_role='owner')
    );
  IF v_open > 0 THEN RAISE EXCEPTION 'Queue is not empty (% open)', v_open; END IF;
  INSERT INTO public.staff_checkins (user_id, day) VALUES (v_uid, (now() AT TIME ZONE 'UTC')::date)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Quota for current ISO week (Mon-Sun UTC)
CREATE OR REPLACE FUNCTION public.my_quota()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week_start date := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;
  v_actions int;
  v_checkins int;
BEGIN
  SELECT count(*) INTO v_actions FROM public.report_actions
    WHERE actor_id = v_uid AND created_at >= v_week_start;
  SELECT count(*) INTO v_checkins FROM public.staff_checkins
    WHERE user_id = v_uid AND day >= v_week_start;
  RETURN jsonb_build_object('actions', v_actions, 'checkins', v_checkins, 'points', v_actions + (v_checkins*2), 'goal', 10);
END;
$$;

-- Weekly payroll (cron)
CREATE OR REPLACE FUNCTION public.run_weekly_payroll()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week_start date := (date_trunc('week', (now() AT TIME ZONE 'UTC') - interval '7 days'))::date;
  v_week_end date := v_week_start + 7;
  r record; v_points int; v_prev_warning boolean;
BEGIN
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
$$;

-- AuraGuard trigger: large incoming amount in short window
CREATE OR REPLACE FUNCTION public.auraguard_scan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recent numeric; v_target uuid;
BEGIN
  v_target := NEW.receiver_id;
  SELECT coalesce(sum(amount_received),0) INTO v_recent FROM public.transactions
    WHERE receiver_id = v_target AND created_at > now() - interval '1 hour';
  IF v_recent > 30 THEN
    INSERT INTO public.reports (type, priority, queue, target_user_id, payload)
    VALUES ('auraguard', 1, 'mod', v_target,
      jsonb_build_object('reason','Excessive Aura received in 1h','amount', v_recent));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auraguard ON public.transactions;
CREATE TRIGGER trg_auraguard AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.auraguard_scan();

-- Ban guard inside send_aura
CREATE OR REPLACE FUNCTION public.send_aura(p_recipient text, p_amount numeric, p_message text DEFAULT NULL::text)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_uid uuid := auth.uid();
  v_sender public.profiles;
  v_receiver public.profiles;
  v_recent_sum numeric;
  v_base numeric;
  v_limit numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_msg text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if public.is_banned(v_uid) then raise exception 'You are banned'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if v_amount > 10 then raise exception 'Transaction denied by the State: max 10 Aura per transfer'; end if;
  select * into v_sender from public.profiles where id = v_uid for update;
  if v_sender.nickname is null then raise exception 'Set your nickname first, comrade'; end if;
  select * into v_receiver from public.profiles where lower(nickname) = lower(trim(p_recipient)) for update;
  if v_receiver.id is null then raise exception 'The State does not recognize this comrade'; end if;
  if v_receiver.id = v_sender.id then raise exception 'You cannot send Aura to yourself, comrade'; end if;
  if v_sender.aura_balance < v_amount then raise exception 'Insufficient Aura, comrade'; end if;
  select coalesce(sum(amount_sent), 0) into v_recent_sum from public.transactions
    where sender_id = v_sender.id and created_at > now() - interval '24 hours';
  v_base := v_sender.aura_balance + v_recent_sum;
  v_limit := round(v_base * 0.10, 2);
  if v_recent_sum + v_amount > v_limit then
    raise exception 'Transaction denied by the State: daily limit exceeded (% / % Aura used)', v_recent_sum, v_limit;
  end if;
  v_msg := nullif(trim(coalesce(p_message, '')), '');
  if v_msg is not null and length(v_msg) > 200 then v_msg := left(v_msg, 200); end if;
  update public.profiles set aura_balance = aura_balance - v_amount where id = v_sender.id returning * into v_sender;
  update public.profiles set aura_balance = aura_balance + (v_amount * 1.5) where id = v_receiver.id;
  insert into public.transactions (sender_id, receiver_id, amount_sent, amount_received, message)
    values (v_sender.id, v_receiver.id, v_amount, v_amount * 1.5, v_msg);
  return v_sender;
end;
$function$;
