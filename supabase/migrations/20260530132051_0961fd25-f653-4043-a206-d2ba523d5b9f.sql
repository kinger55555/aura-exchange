
-- Promote any user via profile button. Owner promotes to admin, Admin promotes to moderator.
CREATE OR REPLACE FUNCTION public.promote_user(p_user_id uuid, p_role public.staff_role, p_salary numeric DEFAULT 10)
RETURNS public.staff_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor public.staff_role := public.highest_role(v_uid);
  v_row public.staff_roles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_role = 'owner' THEN RAISE EXCEPTION 'Owner cannot be appointed'; END IF;
  IF p_role = 'admin' AND v_actor <> 'owner' THEN RAISE EXCEPTION 'Only the Owner promotes Admins'; END IF;
  IF p_role = 'moderator' AND v_actor NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Insufficient privilege'; END IF;
  IF p_salary < 0 OR p_salary > 1000 THEN RAISE EXCEPTION 'Salary 0-1000'; END IF;

  INSERT INTO public.staff_roles (user_id, role, hired_by, weekly_salary)
  VALUES (p_user_id, p_role, v_uid, p_salary)
  ON CONFLICT (user_id, role) DO UPDATE SET hired_by = EXCLUDED.hired_by, weekly_salary = EXCLUDED.weekly_salary
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Owner sets their own weekly salary
CREATE OR REPLACE FUNCTION public.set_owner_salary(p_salary numeric)
RETURNS public.staff_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.staff_roles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can set the Owner salary'; END IF;
  IF p_salary < 0 OR p_salary > 10000 THEN RAISE EXCEPTION 'Salary 0-10000'; END IF;
  UPDATE public.staff_roles SET weekly_salary = p_salary
    WHERE user_id = v_uid AND role = 'owner'
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Oblivion Protocol: self-delete account
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) = 'owner' THEN RAISE EXCEPTION 'The Owner cannot vanish'; END IF;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- Stronger AuraGuard: also flag burst sends
CREATE OR REPLACE FUNCTION public.auraguard_scan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recent numeric; v_target uuid; v_bursts int; v_sender uuid;
BEGIN
  v_target := NEW.receiver_id;
  v_sender := NEW.sender_id;

  SELECT coalesce(sum(amount_received),0) INTO v_recent FROM public.transactions
    WHERE receiver_id = v_target AND created_at > now() - interval '1 hour';
  IF v_recent > 30 THEN
    INSERT INTO public.reports (type, priority, queue, target_user_id, payload)
    VALUES ('auraguard', 1, 'mod', v_target,
      jsonb_build_object('reason','Excessive Aura received in 1h','amount', v_recent));
  END IF;

  SELECT count(*) INTO v_bursts FROM public.transactions
    WHERE sender_id = v_sender AND created_at > now() - interval '5 minutes';
  IF v_bursts >= 8 THEN
    INSERT INTO public.reports (type, priority, queue, target_user_id, payload)
    VALUES ('auraguard', 1, 'mod', v_sender,
      jsonb_build_object('reason','Burst sending detected', 'count', v_bursts, 'window','5min'));
  END IF;

  RETURN NEW;
END;
$$;

-- Make sure trigger exists
DROP TRIGGER IF EXISTS auraguard_scan_trg ON public.transactions;
CREATE TRIGGER auraguard_scan_trg
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.auraguard_scan();

-- Seed Owner salary baseline if missing
UPDATE public.staff_roles SET weekly_salary = 100 WHERE role = 'owner' AND weekly_salary = 0;
