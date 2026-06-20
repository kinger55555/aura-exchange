CREATE OR REPLACE FUNCTION public.swap_party_game(p_party_id uuid, p_game_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_game_type NOT IN ('assembly_line','reactor_core','synchronized_march') THEN
    RAISE EXCEPTION 'Unknown game';
  END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the owner can swap the game'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'A shift is in progress';
  END IF;

  UPDATE public.parties SET current_game = p_game_type WHERE id = p_party_id;
END;
$function$