ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_mode_saved_balance numeric;

CREATE OR REPLACE FUNCTION public.reset_all_aura()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can reset Aura'; END IF;
  UPDATE public.profiles
    SET aura_balance = 10,
        test_mode = false,
        test_mode_saved_balance = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_test_mode(p_nickname text, p_enabled boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_infinite numeric := 999999999;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can toggle test mode'; END IF;

  SELECT * INTO v_target FROM public.profiles
    WHERE lower(nickname) = lower(trim(p_nickname)) FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;

  IF p_enabled THEN
    IF v_target.test_mode THEN RETURN v_target; END IF;
    UPDATE public.profiles
      SET test_mode = true,
          test_mode_saved_balance = v_target.aura_balance,
          aura_balance = v_infinite
      WHERE id = v_target.id RETURNING * INTO v_target;
  ELSE
    IF NOT v_target.test_mode THEN RETURN v_target; END IF;
    UPDATE public.profiles
      SET test_mode = false,
          aura_balance = COALESCE(v_target.test_mode_saved_balance, 10),
          test_mode_saved_balance = NULL
      WHERE id = v_target.id RETURNING * INTO v_target;
  END IF;
  RETURN v_target;
END;
$$;