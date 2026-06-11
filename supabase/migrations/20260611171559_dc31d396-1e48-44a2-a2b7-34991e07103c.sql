CREATE OR REPLACE FUNCTION public.sell_title(p_title_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cost integer;
  v_sell_price integer;
  v_owned boolean;
  v_equipped boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT cost INTO v_cost FROM public.titles WHERE id = p_title_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Title not found'; END IF;
  IF v_cost IS NULL OR v_cost <= 0 THEN RAISE EXCEPTION 'This title cannot be sold'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_titles WHERE user_id = v_user AND title_id = p_title_id
  ) INTO v_owned;
  IF NOT v_owned THEN RAISE EXCEPTION 'You do not own this title'; END IF;

  -- Calculate sell price: cost / 5 * 4 (80% refund)
  v_sell_price := (v_cost / 5) * 4;

  -- If equipped, unequip first
  SELECT equipped_title_id = p_title_id INTO v_equipped
  FROM public.profiles WHERE id = v_user;
  IF v_equipped THEN
    UPDATE public.profiles SET equipped_title_id = NULL WHERE id = v_user;
  END IF;

  -- Remove ownership
  DELETE FROM public.user_titles WHERE user_id = v_user AND title_id = p_title_id;

  -- Refund aura
  UPDATE public.profiles SET aura_balance = aura_balance + v_sell_price WHERE id = v_user;

  RETURN v_sell_price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sell_title(uuid) TO authenticated;