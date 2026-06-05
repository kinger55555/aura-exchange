
ALTER TABLE public.user_titles ADD COLUMN IF NOT EXISTS bought_with_gray boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.purchase_title_gray(p_title_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cost integer;
  v_buyable boolean;
  v_bal numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT buyable, cost INTO v_buyable, v_cost FROM public.titles WHERE id = p_title_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Title not found'; END IF;
  IF NOT v_buyable THEN RAISE EXCEPTION 'This title is not for sale'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_user AND title_id = p_title_id) THEN
    RAISE EXCEPTION 'You already own this title';
  END IF;
  SELECT gray_aura INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF COALESCE(v_bal, 0) < v_cost THEN RAISE EXCEPTION 'Not enough Gray Aura'; END IF;
  UPDATE public.profiles SET gray_aura = gray_aura - v_cost WHERE id = v_user;
  INSERT INTO public.user_titles (user_id, title_id, bought_with_gray) VALUES (v_user, p_title_id, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_all_gray_aura()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can reset gray Aura'; END IF;

  -- Unequip any title that was bought with gray aura
  UPDATE public.profiles p
    SET equipped_title_id = NULL
    WHERE equipped_title_id IN (
      SELECT title_id FROM public.user_titles ut
      WHERE ut.user_id = p.id AND ut.bought_with_gray = true
    );

  -- Delete the gray-purchased titles
  DELETE FROM public.user_titles WHERE bought_with_gray = true;

  -- Reset gray aura and rank
  UPDATE public.profiles
    SET gray_aura = 0,
        current_rank = COALESCE(rank_before_gray, current_rank),
        rank_before_gray = NULL;
END; $function$;
