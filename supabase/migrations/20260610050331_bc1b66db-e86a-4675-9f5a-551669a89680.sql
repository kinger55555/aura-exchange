CREATE OR REPLACE FUNCTION public.abandon_party()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.party_members WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.evacuate_all_parties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only the Owner may evacuate all parties';
  END IF;
  DELETE FROM public.party_members;
END;
$$;

-- Immediate cleanup of orphaned memberships
DELETE FROM public.party_members
WHERE party_id NOT IN (SELECT id FROM public.parties);