-- Re-tier exclusive titles (O.G and THE GLITCH) to a new 'Exclusive' tier so they
-- never appear in the public titles catalog or as suitcase drops.
UPDATE public.titles
  SET tier = 'Exclusive'
  WHERE text IN ('O.G', 'THE GLITCH');

-- Update claim_event_reward to report the new 'Exclusive' tier for the O.G title
CREATE OR REPLACE FUNCTION public.claim_event_reward()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day int := public._falling_star_event_day();
  v_profile public.profiles;
  v_next int;
  v_reward text;
  v_amount numeric := 0;
  v_title_id uuid;
  v_title_text text;
  v_max_rank int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_day = 0 THEN RAISE EXCEPTION 'Event not active'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_profile.event_last_claim_day >= v_day THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;
  IF v_profile.event_claimed_count >= 7 THEN
    RAISE EXCEPTION 'Event complete';
  END IF;

  v_next := v_profile.event_claimed_count + 1;

  IF v_next = 1 THEN
    v_reward := 'aura'; v_amount := 1;
    UPDATE public.profiles SET aura_balance = aura_balance + 1 WHERE id = v_uid;
  ELSIF v_next = 2 THEN
    v_reward := 'aura'; v_amount := 2;
    UPDATE public.profiles SET aura_balance = aura_balance + 2 WHERE id = v_uid;
  ELSIF v_next = 3 THEN
    v_reward := 'aura'; v_amount := 4;
    UPDATE public.profiles SET aura_balance = aura_balance + 4 WHERE id = v_uid;
  ELSIF v_next = 4 THEN
    v_reward := 'free_suitcase';
    UPDATE public.profiles SET free_suitcases = free_suitcases + 1 WHERE id = v_uid;
  ELSIF v_next = 5 THEN
    v_reward := 'rank_up';
    SELECT COALESCE(MAX(rank), 1) INTO v_max_rank FROM public.ranks;
    UPDATE public.profiles
      SET current_rank = LEAST(current_rank + 1, v_max_rank)
      WHERE id = v_uid;
  ELSIF v_next = 6 THEN
    v_reward := 'falling_star_case';
    UPDATE public.profiles SET falling_star_pending = falling_star_pending + 1 WHERE id = v_uid;
  ELSIF v_next = 7 THEN
    v_reward := 'og_title';
    SELECT id, text INTO v_title_id, v_title_text FROM public.titles WHERE text = 'O.G' LIMIT 1;
    IF v_title_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_uid AND title_id = v_title_id) THEN
      INSERT INTO public.user_titles (user_id, title_id) VALUES (v_uid, v_title_id);
    END IF;
  END IF;

  UPDATE public.profiles
    SET event_claimed_count = v_next,
        event_last_claim_day = v_day
    WHERE id = v_uid;

  RETURN jsonb_build_object(
    'day', v_next,
    'reward', v_reward,
    'amount', v_amount,
    'title', CASE WHEN v_title_id IS NOT NULL
                  THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', 'Exclusive')
                  ELSE NULL END
  );
END $$;