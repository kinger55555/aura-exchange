
-- ============== kick_member (owner only; refund kicked member) ==============
CREATE OR REPLACE FUNCTION public.kick_member(p_party_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can kick members'; END IF;
  IF p_user_id = v_party.owner_id THEN RAISE EXCEPTION 'You cannot kick yourself'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress — finish it first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'That comrade is not in the party';
  END IF;

  DELETE FROM public.party_members WHERE party_id = p_party_id AND user_id = p_user_id;
  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_party.aura_bet WHERE id = p_user_id;
  END IF;
END;
$$;
