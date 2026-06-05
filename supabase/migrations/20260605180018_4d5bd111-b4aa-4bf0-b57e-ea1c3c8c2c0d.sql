
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
    WHERE p.equipped_title_id IS NOT NULL
      AND p.equipped_title_id IN (
        SELECT title_id FROM public.user_titles ut
        WHERE ut.user_id = p.id AND ut.bought_with_gray = true
      );

  -- Delete the gray-purchased titles
  DELETE FROM public.user_titles WHERE bought_with_gray = true;

  -- Reset gray aura and roll back ranks bought with it (filter satisfies "UPDATE requires WHERE")
  UPDATE public.profiles
    SET gray_aura = 0,
        current_rank = COALESCE(rank_before_gray, current_rank),
        rank_before_gray = NULL
    WHERE id IS NOT NULL;
END; $function$;
