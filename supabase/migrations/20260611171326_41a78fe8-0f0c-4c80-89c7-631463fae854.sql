GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT (bunker_pending), UPDATE (bunker_pending) ON public.profiles TO authenticated;