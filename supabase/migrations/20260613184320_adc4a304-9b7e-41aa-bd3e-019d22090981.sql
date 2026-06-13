
-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS event_claimed_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_last_claim_day int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS falling_star_pending int NOT NULL DEFAULT 0;

REVOKE SELECT (event_claimed_count, event_last_claim_day, falling_star_pending)
  ON public.profiles FROM authenticated, anon;

-- 2. Insert the O.G title (idempotent)
INSERT INTO public.titles (text, tier, buyable, cost, unlock_condition, is_glitch)
VALUES ('O.G', 'Godlike', false, NULL,
        'Claim every day of the Falling Star event.', false)
ON CONFLICT (text) DO NOTHING;

-- 3. Realign weekly cycle to Moscow midnight
CREATE OR REPLACE FUNCTION public.get_or_create_game_week()
RETURNS public.game_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.game_weeks;
  v_now_msk timestamp := (now() AT TIME ZONE 'Europe/Moscow');
  v_start_msk timestamp := date_trunc('week', v_now_msk);
  v_start timestamptz := v_start_msk AT TIME ZONE 'Europe/Moscow';
  v_end timestamptz := (v_start_msk + interval '7 days') AT TIME ZONE 'Europe/Moscow';
BEGIN
  SELECT * INTO v_row FROM public.game_weeks WHERE starts_at = v_start LIMIT 1;
  IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;
  INSERT INTO public.game_weeks (week_label, game_name, game_type, starts_at, ends_at)
  VALUES (to_char(v_start_msk, 'IYYY-"W"IW'), 'The Assembly Line', 'assembly_line', v_start, v_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- 4. Realign daily ticket reset to Moscow midnight
CREATE OR REPLACE FUNCTION public.claim_tickets()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_rank public.ranks;
  v_week public.game_weeks;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_daily int := 0;
  v_special int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  SELECT * INTO v_rank FROM public.ranks WHERE rank = v_profile.current_rank;
  v_week := public.get_or_create_game_week();

  IF v_profile.last_daily_ticket_at IS DISTINCT FROM v_today THEN
    v_daily := coalesce(v_rank.tickets, 0);
    IF v_daily > 0 THEN
      INSERT INTO public.tickets (user_id, game_week_id, kind)
      SELECT v_uid, v_week.id, 'regular' FROM generate_series(1, v_daily);
    END IF;
    UPDATE public.profiles SET last_daily_ticket_at = v_today WHERE id = v_uid;
  END IF;

  IF v_profile.last_special_ticket_at IS NULL
     OR date_trunc('month', v_profile.last_special_ticket_at::timestamp)
        <> date_trunc('month', v_today::timestamp) THEN
    v_special := coalesce(v_rank.super_tickets, 0);
    IF v_special > 0 THEN
      INSERT INTO public.tickets (user_id, game_week_id, kind)
      SELECT v_uid, v_week.id, 'special' FROM generate_series(1, v_special);
    END IF;
    UPDATE public.profiles SET last_special_ticket_at = v_today WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('regular_granted', v_daily, 'special_granted', v_special);
END $$;

-- 5. Event config helper (inline anchor)
-- Event start: 2026-06-12 21:00 UTC = 2026-06-13 00:00 Moscow (yesterday Moscow midnight)
-- Event end:   2026-06-19 21:00 UTC = 2026-06-20 00:00 Moscow

CREATE OR REPLACE FUNCTION public._falling_star_event_day(at timestamptz DEFAULT now())
RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN at < '2026-06-12 21:00:00+00'::timestamptz THEN 0
    WHEN at >= '2026-06-19 21:00:00+00'::timestamptz THEN 0
    ELSE (FLOOR(EXTRACT(EPOCH FROM (at - '2026-06-12 21:00:00+00'::timestamptz)) / 86400)::int + 1)
  END
$$;

-- 6. event_status RPC
CREATE OR REPLACE FUNCTION public.event_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day int := public._falling_star_event_day();
  v_claimed int := 0;
  v_last_day int := 0;
  v_pending int := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT event_claimed_count, event_last_claim_day, falling_star_pending
      INTO v_claimed, v_last_day, v_pending
      FROM public.profiles WHERE id = v_uid;
  END IF;
  RETURN jsonb_build_object(
    'event_start', '2026-06-12T21:00:00Z',
    'event_end',   '2026-06-19T21:00:00Z',
    'event_day',   v_day,
    'active',      v_day > 0,
    'claimed_count', v_claimed,
    'last_claim_day', v_last_day,
    'can_claim',   v_day > 0 AND v_last_day < v_day AND v_claimed < 7,
    'falling_star_pending', v_pending
  );
END $$;

-- 7. claim_event_reward RPC
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
                  THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', 'Godlike')
                  ELSE NULL END
  );
END $$;

-- 8. open_falling_star_case: like open_suitcase but uses a falling_star_pending and bumps a random failed slot to true
CREATE OR REPLACE FUNCTION public.open_falling_star_case()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pending int;
  v_spins boolean[] := ARRAY[]::boolean[];
  v_pre_spins boolean[] := ARRAY[]::boolean[];
  v_successes int := 0;
  v_tier text;
  v_title_id uuid;
  v_title_text text;
  v_refund boolean := false;
  v_star_slot int := 0;
  v_failed_indices int[] := ARRAY[]::int[];
  i int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT falling_star_pending INTO v_pending FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF COALESCE(v_pending, 0) <= 0 THEN RAISE EXCEPTION 'No Falling Star Case'; END IF;
  UPDATE public.profiles SET falling_star_pending = falling_star_pending - 1 WHERE id = v_user;

  FOR i IN 1..5 LOOP
    IF random() < 0.2 THEN
      v_pre_spins := v_pre_spins || true;
    ELSE
      v_pre_spins := v_pre_spins || false;
      v_failed_indices := v_failed_indices || i;
    END IF;
  END LOOP;

  v_spins := v_pre_spins;

  -- Falling star: upgrade one random failed slot to a win
  IF array_length(v_failed_indices, 1) > 0 THEN
    v_star_slot := v_failed_indices[1 + floor(random() * array_length(v_failed_indices, 1))::int];
    v_spins[v_star_slot] := true;
  END IF;

  FOR i IN 1..5 LOOP
    IF v_spins[i] THEN v_successes := v_successes + 1; END IF;
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
      -- All owned in tier: refund as another falling star case
      UPDATE public.profiles SET falling_star_pending = falling_star_pending + 1 WHERE id = v_user;
      v_refund := true;
    ELSE
      INSERT INTO public.user_titles (user_id, title_id) VALUES (v_user, v_title_id);
    END IF;
  END IF;

  IF v_successes = 5 THEN
    UPDATE public.profiles SET bunker_pending = true WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'pre_spins', to_jsonb(v_pre_spins),
    'spins', to_jsonb(v_spins),
    'star_slot', v_star_slot,
    'successes', v_successes,
    'tier', v_tier,
    'title', CASE WHEN v_title_id IS NOT NULL
                  THEN jsonb_build_object('id', v_title_id, 'text', v_title_text, 'tier', v_tier)
                  ELSE NULL END,
    'refunded', v_refund,
    'bunker_unlocked', v_successes = 5
  );
END $$;

GRANT EXECUTE ON FUNCTION public.event_status() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_event_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_falling_star_case() TO authenticated;
GRANT EXECUTE ON FUNCTION public._falling_star_event_day(timestamptz) TO authenticated, anon;
