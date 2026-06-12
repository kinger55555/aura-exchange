
-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS amnesty_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_suitcases integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_amnesty_alt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amnesty_main_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

GRANT SELECT (amnesty_acknowledged, free_suitcases, is_amnesty_alt, amnesty_main_id),
      UPDATE (amnesty_acknowledged) ON public.profiles TO authenticated;

-- 2. Declarations table
CREATE TABLE IF NOT EXISTS public.amnesty_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alt_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alt_nickname_raw text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.amnesty_declarations TO authenticated;
GRANT ALL ON public.amnesty_declarations TO service_role;
ALTER TABLE public.amnesty_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own declarations readable" ON public.amnesty_declarations
  FOR SELECT TO authenticated USING (main_user_id = auth.uid() OR public.highest_role(auth.uid()) IS NOT NULL);
-- inserts only via SECURITY DEFINER function; no INSERT policy

-- 3. declare_amnesty RPC
CREATE OR REPLACE FUNCTION public.declare_amnesty(p_alts text[])
RETURNS profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_alt_nick text;
  v_alt_profile public.profiles;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_me.is_amnesty_alt THEN RAISE EXCEPTION 'This account is already declared as a secondary'; END IF;
  IF v_me.amnesty_acknowledged THEN RAISE EXCEPTION 'You already submitted your declaration'; END IF;

  IF p_alts IS NOT NULL THEN
    FOREACH v_alt_nick IN ARRAY p_alts LOOP
      v_alt_nick := trim(v_alt_nick);
      CONTINUE WHEN v_alt_nick = '' OR v_alt_nick IS NULL;
      SELECT * INTO v_alt_profile FROM public.profiles
        WHERE lower(nickname) = lower(v_alt_nick) FOR UPDATE;
      IF v_alt_profile.id IS NULL THEN
        RAISE EXCEPTION 'Comrade % not found', v_alt_nick;
      END IF;
      IF v_alt_profile.id = v_uid THEN
        RAISE EXCEPTION 'You cannot declare yourself as your own alt';
      END IF;
      IF public.highest_role(v_alt_profile.id) IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot declare staff member % as an alt', v_alt_nick;
      END IF;
      UPDATE public.profiles
        SET is_amnesty_alt = true,
            amnesty_main_id = v_uid,
            amnesty_acknowledged = true
        WHERE id = v_alt_profile.id;
      INSERT INTO public.amnesty_declarations (main_user_id, alt_user_id, alt_nickname_raw)
        VALUES (v_uid, v_alt_profile.id, v_alt_nick);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  UPDATE public.profiles
    SET amnesty_acknowledged = true,
        free_suitcases = free_suitcases + v_count
    WHERE id = v_uid
    RETURNING * INTO v_me;
  RETURN v_me;
END; $$;

-- 4. amnesty_process — Owner-only purge & reset
CREATE OR REPLACE FUNCTION public.amnesty_process()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_alt record;
  v_banned int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can run the amnesty reset'; END IF;

  -- Ban every declared alt permanently
  FOR v_alt IN SELECT id FROM public.profiles WHERE is_amnesty_alt = true LOOP
    INSERT INTO public.bans (user_id, issued_by, reason, expires_at)
      VALUES (v_alt.id, v_uid, 'Declared secondary account — amnesty program', NULL);
    v_banned := v_banned + 1;
  END LOOP;

  -- Wipe activity / history for everyone
  DELETE FROM public.transactions WHERE id IS NOT NULL;
  DELETE FROM public.report_actions WHERE id IS NOT NULL;
  DELETE FROM public.reports WHERE id IS NOT NULL;
  DELETE FROM public.tickets WHERE id IS NOT NULL;
  DELETE FROM public.staff_warnings WHERE id IS NOT NULL;
  DELETE FROM public.staff_checkins WHERE id IS NOT NULL;
  DELETE FROM public.aura_bank WHERE user_id IS NOT NULL;
  DELETE FROM public.game_sessions WHERE id IS NOT NULL;
  DELETE FROM public.party_members WHERE id IS NOT NULL;
  DELETE FROM public.parties WHERE id IS NOT NULL;

  -- Unequip + wipe owned titles for non-staff (preserve staff loadouts)
  UPDATE public.profiles SET equipped_title_id = NULL
    WHERE equipped_title_id IS NOT NULL
      AND public.highest_role(id) IS NULL;
  DELETE FROM public.user_titles
    WHERE user_id IN (SELECT id FROM public.profiles WHERE public.highest_role(id) IS NULL);

  -- Reset non-staff comrades (preserve free_suitcases)
  UPDATE public.profiles
    SET aura_balance = 10,
        gray_aura = 0,
        current_rank = 1,
        rank_before_gray = NULL,
        bunker_pending = false,
        test_mode = false,
        test_mode_saved_balance = NULL,
        last_daily_ticket_at = NULL,
        last_special_ticket_at = NULL,
        amnesty_main_id = NULL
    WHERE public.highest_role(id) IS NULL
      AND is_amnesty_alt = false;

  RETURN jsonb_build_object('banned', v_banned);
END; $$;

-- 5. Update open_suitcase to consume free_suitcases first
CREATE OR REPLACE FUNCTION public.open_suitcase()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cost numeric := 5;
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

-- 6. AuraGuard — email-pattern scan (Owner only)
CREATE OR REPLACE FUNCTION public.auraguard_email_scan()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_grp record;
  v_filed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can run AuraGuard scans'; END IF;

  FOR v_grp IN
    SELECT
      lower(regexp_replace(split_part(u.email, '@', 1), '\+.*$', '')) || '@' || lower(split_part(u.email, '@', 2)) AS norm_email,
      array_agg(p.nickname ORDER BY p.created_at) AS nicknames,
      array_agg(u.id ORDER BY p.created_at) AS user_ids
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.email IS NOT NULL AND p.nickname IS NOT NULL
      AND public.highest_role(u.id) IS NULL
    GROUP BY norm_email
    HAVING count(*) > 1
  LOOP
    INSERT INTO public.reports (type, priority, queue, target_user_id, payload)
    VALUES ('auraguard', 1, 'owner', (v_grp.user_ids)[1],
      jsonb_build_object(
        'reason', 'Email pattern cluster (plus-alias / same local part)',
        'normalized_email', v_grp.norm_email,
        'nicknames', v_grp.nicknames,
        'user_ids', v_grp.user_ids
      ));
    v_filed := v_filed + 1;
  END LOOP;

  RETURN jsonb_build_object('clusters_filed', v_filed);
END; $$;
