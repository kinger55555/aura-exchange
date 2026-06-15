
CREATE TABLE public.party_seekers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_seekers TO authenticated;
GRANT ALL ON public.party_seekers TO service_role;
ALTER TABLE public.party_seekers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view seekers" ON public.party_seekers
  FOR SELECT TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_seekers;

CREATE TABLE public.party_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, to_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_invites TO authenticated;
GRANT ALL ON public.party_invites TO service_role;
ALTER TABLE public.party_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invitee or party owner can view invite" ON public.party_invites
  FOR SELECT TO authenticated
  USING (
    to_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.owner_id = auth.uid())
  );
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_invites;

CREATE OR REPLACE FUNCTION public.toggle_lfp(p_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_on THEN
    IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_uid) THEN
      RAISE EXCEPTION 'Leave your current party first';
    END IF;
    SELECT id INTO v_week FROM public.game_weeks ORDER BY starts_at DESC LIMIT 1;
    IF v_week IS NULL THEN RAISE EXCEPTION 'No active week'; END IF;
    INSERT INTO public.party_seekers (user_id, game_week_id)
    VALUES (v_uid, v_week)
    ON CONFLICT (user_id) DO UPDATE SET game_week_id = EXCLUDED.game_week_id, created_at = now();
  ELSE
    DELETE FROM public.party_seekers WHERE user_id = v_uid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_to_party(p_party_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_max int;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = p_party_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Only the party owner can invite';
  END IF;
  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'That player is already in a party';
  END IF;
  SELECT max_players INTO v_max FROM public.parties WHERE id = p_party_id;
  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'Party is full';
  END IF;
  INSERT INTO public.party_invites (party_id, from_user_id, to_user_id)
  VALUES (p_party_id, v_uid, p_user_id)
  ON CONFLICT (party_id, to_user_id) DO UPDATE
    SET status = 'pending', from_user_id = EXCLUDED.from_user_id, created_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_party_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party uuid;
  v_max int;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT party_id INTO v_party FROM public.party_invites
    WHERE id = p_invite_id AND to_user_id = v_uid AND status = 'pending';
  IF v_party IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Leave your current party first';
  END IF;
  SELECT max_players INTO v_max FROM public.parties WHERE id = v_party;
  SELECT count(*) INTO v_count FROM public.party_members WHERE party_id = v_party;
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'Party is full';
  END IF;
  INSERT INTO public.party_members (party_id, user_id) VALUES (v_party, v_uid);
  UPDATE public.party_invites SET status = 'accepted' WHERE id = p_invite_id;
  DELETE FROM public.party_seekers WHERE user_id = v_uid;
  DELETE FROM public.party_invites WHERE to_user_id = v_uid AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_party_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.party_invites SET status = 'declined'
    WHERE id = p_invite_id AND to_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_lfp(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_party(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_party_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_party_invite(uuid) TO authenticated;
