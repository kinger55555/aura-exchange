REVOKE SELECT (password) ON public.parties FROM authenticated;
REVOKE SELECT (password) ON public.parties FROM anon;
GRANT SELECT (id, name, aura_bet, owner_id, game_week_id, created_at) ON public.parties TO authenticated;

ALTER PUBLICATION supabase_realtime DROP TABLE public.game_sessions;