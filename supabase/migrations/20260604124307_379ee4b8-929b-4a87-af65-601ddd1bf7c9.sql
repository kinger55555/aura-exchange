
-- Restrict gray-aura grants to owner only
CREATE OR REPLACE FUNCTION public.grant_gray_aura(p_nickname text, p_amount numeric)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_amt numeric := round(p_amount::numeric, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can grant gray Aura'; END IF;
  IF v_amt IS NULL OR v_amt = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  UPDATE public.profiles
    SET gray_aura = greatest(gray_aura + v_amt, 0)
    WHERE lower(nickname) = lower(trim(p_nickname))
    RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  RETURN v_target;
END; $$;

-- Owner sets a comrade's aura to an absolute value
CREATE OR REPLACE FUNCTION public.set_user_aura(p_nickname text, p_amount numeric)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_amt numeric := round(p_amount::numeric, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can set Aura'; END IF;
  IF v_amt IS NULL THEN RAISE EXCEPTION 'Amount required'; END IF;
  UPDATE public.profiles
    SET aura_balance = v_amt
    WHERE lower(nickname) = lower(trim(p_nickname))
    RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  RETURN v_target;
END; $$;

-- Owner ascends a comrade by one rank (free, normal upgrade — not gray)
CREATE OR REPLACE FUNCTION public.owner_rank_up(p_nickname text)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_next public.ranks;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can rank up comrades'; END IF;
  SELECT * INTO v_target FROM public.profiles WHERE lower(nickname) = lower(trim(p_nickname)) FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  v_next := public.get_rank_info(v_target.current_rank + 1);
  IF v_next.rank IS NULL THEN RAISE EXCEPTION 'No higher rank exists'; END IF;
  UPDATE public.profiles
    SET current_rank = v_next.rank
    WHERE id = v_target.id RETURNING * INTO v_target;
  RETURN v_target;
END; $$;
