
-- 1) parties.password: add has_password generated column, revoke password column access
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS has_password boolean GENERATED ALWAYS AS (password IS NOT NULL) STORED;
REVOKE SELECT ON public.parties FROM anon, authenticated;
GRANT SELECT (id, game_week_id, name, aura_bet, max_players, current_game, owner_id, created_at, has_password) ON public.parties TO authenticated;
GRANT SELECT (id, game_week_id, name, aura_bet, max_players, current_game, owner_id, created_at, has_password) ON public.parties TO anon;

-- 2) staff_roles: revoke sensitive cols
REVOKE SELECT ON public.staff_roles FROM anon, authenticated;
GRANT SELECT (id, user_id, role) ON public.staff_roles TO anon, authenticated;
-- Allow staff themselves to see their own salary via the staff RPC (list_staff_full uses service_definer)
-- Self can also see own weekly_salary through a dedicated RPC
CREATE OR REPLACE FUNCTION public.my_staff_salary()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT weekly_salary FROM public.staff_roles WHERE user_id = auth.uid() AND role = 'owner'
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.my_staff_salary() TO authenticated;

-- 3) profiles: revoke internal economy state columns
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, nickname, aura_balance, gray_aura, current_rank, equipped_title_id, title_position, created_at) ON public.profiles TO anon, authenticated;
GRANT UPDATE, INSERT, DELETE ON public.profiles TO authenticated;

-- 4) user_titles: remove anon read; only owner sees own
DROP POLICY IF EXISTS "anyone read titles for display" ON public.user_titles;
DROP POLICY IF EXISTS "users read own titles" ON public.user_titles;
CREATE POLICY "users read own titles" ON public.user_titles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE SELECT ON public.user_titles FROM anon;

-- 5) Realtime: remove reports from publication to avoid leaking via channel subscriptions; UI uses polling/refetch on event
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.reports';
  END IF;
END $$;
