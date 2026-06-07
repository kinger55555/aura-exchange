
CREATE OR REPLACE FUNCTION public.full_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can perform a full reset'; END IF;

  -- Unequip everything first
  UPDATE public.profiles SET equipped_title_id = NULL WHERE equipped_title_id IS NOT NULL;

  -- Wipe owned titles
  DELETE FROM public.user_titles WHERE user_id IS NOT NULL;

  -- Wipe activity / history
  DELETE FROM public.transactions WHERE id IS NOT NULL;
  DELETE FROM public.report_actions WHERE id IS NOT NULL;
  DELETE FROM public.reports WHERE id IS NOT NULL;
  DELETE FROM public.bans WHERE id IS NOT NULL;
  DELETE FROM public.tickets WHERE id IS NOT NULL;
  DELETE FROM public.staff_warnings WHERE id IS NOT NULL;
  DELETE FROM public.staff_checkins WHERE id IS NOT NULL;
  DELETE FROM public.aura_bank WHERE user_id IS NOT NULL;
  DELETE FROM public.game_sessions WHERE id IS NOT NULL;
  DELETE FROM public.party_members WHERE id IS NOT NULL;
  DELETE FROM public.parties WHERE id IS NOT NULL;

  -- Reset every comrade
  UPDATE public.profiles
    SET aura_balance = 10,
        gray_aura = 0,
        current_rank = 1,
        rank_before_gray = NULL,
        equipped_title_id = NULL,
        test_mode = false,
        test_mode_saved_balance = NULL,
        last_daily_ticket_at = NULL,
        last_special_ticket_at = NULL
    WHERE id IS NOT NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.full_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.full_reset() TO authenticated, service_role;
