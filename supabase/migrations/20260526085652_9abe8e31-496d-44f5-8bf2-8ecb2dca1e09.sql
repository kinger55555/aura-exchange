
-- ============= TABLES =============

CREATE TABLE public.game_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label text NOT NULL,
  game_name text NOT NULL,
  game_type text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT date_trunc('week', now()),
  ends_at timestamptz NOT NULL DEFAULT date_trunc('week', now()) + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  name text NOT NULL,
  aura_bet numeric NOT NULL DEFAULT 0,
  password text,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, user_id)
);

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  aura_quota numeric NOT NULL DEFAULT 0,
  result_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============= RLS =============

ALTER TABLE public.game_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view game weeks" ON public.game_weeks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can view parties" ON public.parties
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can view party members" ON public.party_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view their own tickets" ON public.tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Members can view their party sessions" ON public.game_sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.party_members pm WHERE pm.party_id = game_sessions.party_id AND pm.user_id = auth.uid())
  );

-- ============= FUNCTIONS =============

CREATE OR REPLACE FUNCTION public.get_or_create_game_week()
RETURNS public.game_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.game_weeks;
  v_start timestamptz := date_trunc('week', now());
  v_end timestamptz := v_start + interval '7 days';
  v_games text[] := ARRAY['assembly_line','reactor_core','synchronized_march','resource_allocation'];
  v_names text[] := ARRAY['The Assembly Line','The Reactor Core','Synchronized March','Resource Allocation'];
  v_idx int;
  v_week_num int;
BEGIN
  SELECT * INTO v_row FROM public.game_weeks WHERE starts_at = v_start LIMIT 1;
  IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;

  v_week_num := extract(week from v_start)::int;
  v_idx := (v_week_num % 4) + 1;

  INSERT INTO public.game_weeks (week_label, game_name, game_type, starts_at, ends_at)
  VALUES (to_char(v_start, 'IYYY-"W"IW'), v_names[v_idx], v_games[v_idx], v_start, v_end)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_tickets()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week public.game_weeks;
  v_today_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_week := public.get_or_create_game_week();

  SELECT count(*) INTO v_today_count FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_week.id
      AND created_at >= date_trunc('day', now());

  IF v_today_count < 3 THEN
    INSERT INTO public.tickets (user_id, game_week_id)
    SELECT v_uid, v_week.id FROM generate_series(1, 3 - v_today_count);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_party(p_name text, p_aura_bet numeric, p_password text DEFAULT NULL)
RETURNS public.parties
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week public.game_weeks;
  v_name text := trim(p_name);
  v_bet numeric := round(coalesce(p_aura_bet, 0)::numeric, 2);
  v_pwd text := nullif(trim(coalesce(p_password, '')), '');
  v_row public.parties;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 30 THEN
    RAISE EXCEPTION 'Party name must be 2-30 characters';
  END IF;
  IF v_bet < 0 OR v_bet > 100 THEN RAISE EXCEPTION 'Aura bet must be 0-100'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;
  IF v_profile.aura_balance < v_bet THEN RAISE EXCEPTION 'Insufficient Aura for the bet'; END IF;

  v_week := public.get_or_create_game_week();

  INSERT INTO public.parties (game_week_id, name, aura_bet, password, owner_id)
  VALUES (v_week.id, v_name, v_bet, v_pwd, v_uid)
  RETURNING * INTO v_row;

  -- Owner auto-joins; deduct bet
  INSERT INTO public.party_members (party_id, user_id) VALUES (v_row.id, v_uid);
  IF v_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_bet WHERE id = v_uid;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party(p_party_id uuid, p_password text DEFAULT NULL)
RETURNS public.party_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_profile public.profiles;
  v_row public.party_members;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF v_party.password IS NOT NULL AND v_party.password <> coalesce(p_password, '') THEN
    RAISE EXCEPTION 'Incorrect password';
  END IF;
  IF EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_profile.nickname IS NULL THEN RAISE EXCEPTION 'Set your nickname first, comrade'; END IF;
  IF v_profile.aura_balance < v_party.aura_bet THEN RAISE EXCEPTION 'Insufficient Aura for the bet'; END IF;

  INSERT INTO public.party_members (party_id, user_id) VALUES (p_party_id, v_uid) RETURNING * INTO v_row;
  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_party.aura_bet WHERE id = v_uid;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game_session(p_party_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_week public.game_weeks;
  v_member_count int;
  v_ticket public.tickets;
  v_row public.game_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not a member of this party';
  END IF;
  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_member_count < 3 THEN RAISE EXCEPTION 'Need at least 3 comrades'; END IF;

  SELECT * INTO v_week FROM public.game_weeks WHERE id = v_party.game_week_id;

  -- Consume one ticket
  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_week.id AND used_at IS NULL
      AND created_at >= date_trunc('day', now())
    LIMIT 1 FOR UPDATE;
  IF v_ticket.id IS NULL THEN RAISE EXCEPTION 'No tickets remaining today'; END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  INSERT INTO public.game_sessions (party_id, game_type, aura_quota)
  VALUES (p_party_id, v_week.game_type, v_party.aura_bet * v_member_count)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_game(p_session_id uuid, p_status text, p_result_data jsonb)
RETURNS public.game_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.game_sessions;
  v_party public.parties;
  v_multiplier numeric;
  v_dissident_id uuid;
  v_member_count int;
  v_loyal_count int;
  v_payout_per numeric;
  v_row public.game_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status <> 'in_progress' THEN RETURN v_session; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = v_session.party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = v_session.party_id;
  v_multiplier := coalesce((p_result_data->>'multiplier')::numeric, 0);
  v_dissident_id := nullif(p_result_data->>'dissidentId', '')::uuid;
  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = v_session.party_id;

  UPDATE public.game_sessions
    SET status = p_status, result_data = p_result_data
    WHERE id = p_session_id RETURNING * INTO v_row;

  IF v_party.aura_bet > 0 THEN
    IF v_dissident_id IS NOT NULL THEN
      -- Refund all loyal members; dissident loses bet
      UPDATE public.profiles SET aura_balance = aura_balance + v_party.aura_bet
        WHERE id IN (
          SELECT user_id FROM public.party_members
          WHERE party_id = v_session.party_id AND user_id <> v_dissident_id
        );
    ELSIF v_multiplier > 0 THEN
      -- Distribute pot * multiplier among all
      v_loyal_count := v_member_count;
      v_payout_per := round(v_party.aura_bet * v_multiplier, 2);
      UPDATE public.profiles SET aura_balance = aura_balance + v_payout_per
        WHERE id IN (SELECT user_id FROM public.party_members WHERE party_id = v_session.party_id);
    END IF;
    -- multiplier=0 with no dissident: collective failure, no refund
  END IF;

  RETURN v_row;
END;
$$;
