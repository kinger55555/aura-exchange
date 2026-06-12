
-- 1. Hide party passwords from clients (only owner via RPC if ever needed)
REVOKE SELECT (password) ON public.parties FROM authenticated, anon;

-- 2. Hide internal/sensitive profile fields from all clients (including self via direct select).
--    Provide a SECURITY DEFINER RPC for self-reads.
REVOKE SELECT (
  test_mode,
  test_mode_saved_balance,
  bunker_pending,
  amnesty_acknowledged,
  is_amnesty_alt,
  amnesty_main_id,
  rank_before_gray,
  last_daily_ticket_at,
  last_special_ticket_at
) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.my_private_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'bunker_pending', v_row.bunker_pending,
    'amnesty_acknowledged', v_row.amnesty_acknowledged,
    'is_amnesty_alt', v_row.is_amnesty_alt,
    'amnesty_main_id', v_row.amnesty_main_id,
    'test_mode', v_row.test_mode,
    'last_daily_ticket_at', v_row.last_daily_ticket_at,
    'last_special_ticket_at', v_row.last_special_ticket_at,
    'rank_before_gray', v_row.rank_before_gray
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_private_profile() TO authenticated;

-- 3. Restrict amnesty_declarations reads to admin/owner (moderators no longer see them).
DROP POLICY IF EXISTS "own declarations readable" ON public.amnesty_declarations;
CREATE POLICY "own or staff declarations readable"
ON public.amnesty_declarations
FOR SELECT
TO authenticated
USING (
  main_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
);
