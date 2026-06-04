
-- Gray aura: a test currency owners and admins can grant. Tracks rank changes
-- so the owner can wipe everything bought with gray aura.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gray_aura numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_before_gray integer;

-- Owner / admin grants gray aura to a comrade (no balance cost; pure test grant)
CREATE OR REPLACE FUNCTION public.grant_gray_aura(p_nickname text, p_amount numeric)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.staff_role;
  v_target public.profiles;
  v_amt numeric := round(p_amount::numeric, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role := public.highest_role(v_uid);
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Only Owner or Admin can grant gray Aura'; END IF;
  IF v_amt IS NULL OR v_amt = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  IF v_role = 'admin' AND abs(v_amt) > 1000 THEN RAISE EXCEPTION 'Admin grant capped at 1000'; END IF;

  UPDATE public.profiles
    SET gray_aura = greatest(gray_aura + v_amt, 0)
    WHERE lower(nickname) = lower(trim(p_nickname))
    RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  RETURN v_target;
END; $$;

-- Owner grants real aura
CREATE OR REPLACE FUNCTION public.grant_aura(p_nickname text, p_amount numeric)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_amt numeric := round(p_amount::numeric, 2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can grant Aura'; END IF;
  IF v_amt IS NULL OR v_amt = 0 THEN RAISE EXCEPTION 'Amount must be non-zero'; END IF;
  UPDATE public.profiles
    SET aura_balance = greatest(aura_balance + v_amt, 0)
    WHERE lower(nickname) = lower(trim(p_nickname))
    RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  RETURN v_target;
END; $$;

-- Owner sets a rank directly (free); snapshots rank_before_gray=null so it survives reset
CREATE OR REPLACE FUNCTION public.set_user_rank(p_nickname text, p_rank integer)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can set ranks'; END IF;
  IF p_rank < 1 THEN RAISE EXCEPTION 'Rank must be >= 1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ranks WHERE rank = p_rank) THEN
    RAISE EXCEPTION 'Unknown rank';
  END IF;
  UPDATE public.profiles
    SET current_rank = p_rank,
        rank_before_gray = NULL
    WHERE lower(nickname) = lower(trim(p_nickname))
    RETURNING * INTO v_target;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  RETURN v_target;
END; $$;

-- Buy next rank using gray aura. Snapshots original rank on first gray purchase.
CREATE OR REPLACE FUNCTION public.purchase_rank_gray()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_next public.ranks;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  v_next := public.get_rank_info(v_me.current_rank + 1);
  IF v_me.gray_aura < v_next.upgrade_cost THEN
    RAISE EXCEPTION 'Insufficient gray Aura: need % to ascend to %', v_next.upgrade_cost, v_next.name;
  END IF;
  UPDATE public.profiles
    SET gray_aura = gray_aura - v_next.upgrade_cost,
        current_rank = v_next.rank,
        rank_before_gray = COALESCE(rank_before_gray, v_me.current_rank)
    WHERE id = v_uid RETURNING * INTO v_me;
  RETURN v_me;
END; $$;

-- Owner resets ALL gray aura + rolls back any rank bought with gray aura
CREATE OR REPLACE FUNCTION public.reset_all_gray_aura()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.highest_role(v_uid) <> 'owner' THEN RAISE EXCEPTION 'Only the Owner can reset gray Aura'; END IF;
  UPDATE public.profiles
    SET gray_aura = 0,
        current_rank = COALESCE(rank_before_gray, current_rank),
        rank_before_gray = NULL;
END; $$;
