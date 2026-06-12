CREATE OR REPLACE FUNCTION public.open_suitcase()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cost numeric := 15;
  v_bal numeric;
  v_free int;
  v_used_free boolean := false;
  v_spins boolean[] := ARRAY[]::boolean[];
  v_successes int := 0;
  v_tier text;
  v_title_id uuid;
  v_title_text text;
  v_refund boolean := false;
  i int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT aura_balance, free_suitcases INTO v_bal, v_free FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_free > 0 THEN
    UPDATE public.profiles SET free_suitcases = free_suitcases - 1 WHERE id = v_user;
    v_used_free := true;
  ELSE
    IF v_bal < v_cost THEN RAISE EXCEPTION 'Not enough Aura'; END IF;
    UPDATE public.profiles SET aura_balance = aura_balance - v_cost WHERE id = v_user;
  END IF;

  FOR i IN 1..5 LOOP
    IF random() < 0.2 THEN
      v_spins := v_spins || true;
      v_successes := v_successes + 1;
    ELSE
      v_spins := v_spins || false;
    END IF;
  END LOOP;

  v_tier := CASE v_successes
    WHEN 1 THEN 'Common' WHEN 2 THEN 'Rare' WHEN 3 THEN 'Epic'
    WHEN 4 THEN 'Legendary' WHEN 5 THEN 'Godlike' ELSE NULL END;

  IF v_tier IS NOT NULL THEN
    SELECT id, text INTO v_title_id, v_title_text
    FROM public.titles
    WHERE tier = v_tier AND buyable = true AND is_glitch = false
      AND id NOT IN (SELECT title_id FROM public.user_titles WHERE user_id = v_user)
    ORDER BY random() LIMIT 1;

    IF v_title_id IS NULL THEN
      IF v_used_free THEN
        UPDATE public.profiles SET free_suitcases = free_suitcases + 1 WHERE id = v_user;
      ELSE
        UPDATE public.profiles SET aura_balance = aura_balance + v_cost WHERE id = v_user;
      END IF;
      v_refund := true;
    ELSE
      INSERT INTO public.user_titles (user_id, title_id) VALUES (v_user, v_title_id);
    END IF;
  END IF;

  IF v_successes = 5 THEN
    UPDATE public.profiles SET bunker_pending = true WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'spins', to_jsonb(v_spins),
    'successes', v_successes,
    'tier', v_tier,
    'used_free', v_used_free,
    'title', CASE WHEN v_title_id IS NOT NULL THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', v_tier) ELSE NULL END,
    'refund', v_refund,
    'bunker_unlocked', (v_successes = 5)
  );
END; $$;