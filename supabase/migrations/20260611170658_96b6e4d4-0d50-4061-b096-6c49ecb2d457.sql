
ALTER TABLE public.titles ADD COLUMN IF NOT EXISTS is_glitch boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bunker_pending boolean NOT NULL DEFAULT false;

INSERT INTO public.titles (text, tier, buyable, cost, unlock_condition, is_glitch)
SELECT 'THE GLITCH', 'Godlike', false, NULL, 'Survive the Bunker.', true
WHERE NOT EXISTS (SELECT 1 FROM public.titles WHERE is_glitch = true);

CREATE OR REPLACE FUNCTION public.open_suitcase()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cost numeric := 5;
  v_bal numeric;
  v_spins boolean[] := ARRAY[]::boolean[];
  v_successes int := 0;
  v_tier text;
  v_title_id uuid;
  v_title_text text;
  v_refund boolean := false;
  i int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT aura_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal < v_cost THEN RAISE EXCEPTION 'Not enough Aura'; END IF;
  UPDATE public.profiles SET aura_balance = aura_balance - v_cost WHERE id = v_user;

  FOR i IN 1..5 LOOP
    IF random() < 0.2 THEN
      v_spins := v_spins || true;
      v_successes := v_successes + 1;
    ELSE
      v_spins := v_spins || false;
    END IF;
  END LOOP;

  v_tier := CASE v_successes
    WHEN 1 THEN 'Common'
    WHEN 2 THEN 'Rare'
    WHEN 3 THEN 'Epic'
    WHEN 4 THEN 'Legendary'
    WHEN 5 THEN 'Godlike'
    ELSE NULL
  END;

  IF v_tier IS NOT NULL THEN
    SELECT id, text INTO v_title_id, v_title_text
    FROM public.titles
    WHERE tier = v_tier
      AND buyable = true
      AND is_glitch = false
      AND id NOT IN (SELECT title_id FROM public.user_titles WHERE user_id = v_user)
    ORDER BY random()
    LIMIT 1;

    IF v_title_id IS NULL THEN
      -- No unowned buyable title in that tier: refund the cost
      UPDATE public.profiles SET aura_balance = aura_balance + v_cost WHERE id = v_user;
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
    'title', CASE WHEN v_title_id IS NOT NULL THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', v_tier) ELSE NULL END,
    'bunker_unlocked', v_successes = 5,
    'refunded', v_refund
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enter_bunker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pending boolean;
  v_success boolean;
  v_title_id uuid;
  v_title_text text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT bunker_pending INTO v_pending FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT COALESCE(v_pending, false) THEN RAISE EXCEPTION 'No bunker access'; END IF;
  UPDATE public.profiles SET bunker_pending = false WHERE id = v_user;

  v_success := random() < 0.2;

  IF v_success THEN
    SELECT id, text INTO v_title_id, v_title_text FROM public.titles WHERE is_glitch = true LIMIT 1;
    IF v_title_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_user AND title_id = v_title_id) THEN
      INSERT INTO public.user_titles (user_id, title_id) VALUES (v_user, v_title_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', v_success,
    'title', CASE WHEN v_success AND v_title_id IS NOT NULL
                  THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', 'Godlike', 'is_glitch', true)
                  ELSE NULL END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.open_suitcase() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enter_bunker() TO authenticated;
