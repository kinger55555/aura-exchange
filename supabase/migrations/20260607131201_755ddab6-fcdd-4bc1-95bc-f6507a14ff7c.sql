CREATE OR REPLACE FUNCTION public.destroy_all_parties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party public.parties;
BEGIN
  -- Only owner may use this
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only the Owner may annihilate all parties';
  END IF;

  -- Loop all parties and refund bets
  FOR v_party IN SELECT * FROM public.parties LOOP
    IF v_party.aura_bet > 0 THEN
      UPDATE public.profiles
      SET aura_balance = aura_balance + v_party.aura_bet
      WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = v_party.id);
    END IF;
  END LOOP;

  -- Delete all members then all parties (cascade handles game_sessions if FK exists,
  -- but we also clean up members explicitly)
  DELETE FROM public.party_members;
  DELETE FROM public.parties;
END;
$$;