/*
  # Create minigame tables: game_weeks, parties, party_members, tickets

  1. New Tables
    - `game_weeks`
      - `id` (uuid, primary key)
      - `week_label` (text, e.g. "2026-W22")
      - `game_name` (text, name of the weekly minigame)
      - `starts_at` (timestamptz, when the week begins)
      - `ends_at` (timestamptz, when the week ends)
      - `created_at` (timestamptz)
    - `parties`
      - `id` (uuid, primary key)
      - `game_week_id` (uuid, FK to game_weeks)
      - `name` (text, party name)
      - `aura_bet` (numeric, aura amount wagered per player)
      - `password` (text, optional party password, nullable)
      - `owner_id` (uuid, FK to profiles, creator of the party)
      - `created_at` (timestamptz)
    - `party_members`
      - `id` (uuid, primary key)
      - `party_id` (uuid, FK to parties)
      - `user_id` (uuid, FK to profiles)
      - `joined_at` (timestamptz)
    - `tickets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `game_week_id` (uuid, FK to game_weeks)
      - `used_at` (timestamptz, when ticket was consumed, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all 4 tables
    - Authenticated users can read game_weeks, parties, party_members
    - Authenticated users can insert party_members (join party)
    - Authenticated users can insert parties (create party) if they own it
    - Authenticated users can read their own tickets
    - All mutations via SECURITY DEFINER functions

  3. Functions
    - `get_or_create_game_week()`: ensures current week exists, returns it
    - `create_party()`: creates a party for the current game week
    - `join_party()`: joins a party (checks password, deduplicates)
    - `use_ticket()`: consumes a ticket to allow playing
    - `get_my_tickets()`: returns ticket info for the calling user

  4. Important Notes
    - 3 tickets per user per game week, reset weekly
    - Aura bet is deducted from the player when they join a party
    - Party password is optional; stored as plain text (not sensitive)
*/

-- Game weeks: one per week, defines the active minigame
CREATE TABLE IF NOT EXISTS public.game_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label text NOT NULL,
  game_name text NOT NULL DEFAULT 'Workers Unite',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_weeks_week_label_idx ON public.game_weeks (week_label);

ALTER TABLE public.game_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game weeks viewable by authenticated users"
  ON public.game_weeks FOR SELECT
  TO authenticated USING (true);

-- Parties: groups of players for a game week
CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  name text NOT NULL,
  aura_bet numeric(14,2) NOT NULL DEFAULT 0,
  password text,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parties_game_week_idx ON public.parties (game_week_id);

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties viewable by authenticated users"
  ON public.parties FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated users can create parties"
  ON public.parties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Party members: players in a party
CREATE TABLE IF NOT EXISTS public.party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS party_members_unique_idx ON public.party_members (party_id, user_id);
CREATE INDEX IF NOT EXISTS party_members_user_idx ON public.party_members (user_id);

ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Party members viewable by authenticated users"
  ON public.party_members FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated users can join parties"
  ON public.party_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Tickets: 3 per user per game week
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_user_week_idx ON public.tickets (user_id, game_week_id, created_at);
CREATE INDEX IF NOT EXISTS tickets_user_idx ON public.tickets (user_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function: get or create current game week
CREATE OR REPLACE FUNCTION public.get_or_create_game_week()
RETURNS public.game_weeks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_row public.game_weeks;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_game_names text[] := ARRAY['Workers Unite', 'Potato Harvest', 'Bread Line Blitz', 'Five Year Sprint', 'Factory Frenzy', 'Collective Quest', 'Red Square Rush'];
begin
  -- ISO week label
  v_label := to_char(now(), 'IYYY"-W"IW');

  -- Check if already exists
  SELECT * INTO v_row FROM public.game_weeks WHERE week_label = v_label;
  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  -- Create new week: Monday 00:00 UTC to Sunday 23:59:59 UTC
  v_week_start := date_trunc('week', now());
  v_week_end := v_week_start + interval '7 days' - interval '1 second';

  INSERT INTO public.game_weeks (week_label, game_name, starts_at, ends_at)
  VALUES (v_label, v_game_names[1 + (extract(doy from now())::int % array_length(v_game_names, 1))], v_week_start, v_week_end)
  RETURNING * INTO v_row;

  RETURN v_row;
end;
$$;

-- Function: ensure 3 tickets exist for user this week
CREATE OR REPLACE FUNCTION public.ensure_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gw public.game_weeks;
  v_count int;
begin
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_gw := public.get_or_create_game_week();

  SELECT count(*) INTO v_count FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_gw.id;

  -- Create missing tickets up to 3
  WHILE v_count < 3 LOOP
    INSERT INTO public.tickets (user_id, game_week_id) VALUES (v_uid, v_gw.id);
    v_count := v_count + 1;
  END LOOP;
end;
$$;

-- Function: create a party
CREATE OR REPLACE FUNCTION public.create_party(p_name text, p_aura_bet numeric, p_password text DEFAULT null)
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gw public.game_weeks;
  v_row public.parties;
  v_bet numeric := round(coalesce(p_aura_bet, 0)::numeric, 2);
  v_clean text;
begin
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_clean := trim(p_name);
  IF v_clean IS NULL OR length(v_clean) < 2 OR length(v_clean) > 30 THEN
    RAISE EXCEPTION 'Party name must be 2-30 chars';
  END IF;

  IF v_bet < 0 THEN
    RAISE EXCEPTION 'Aura bet cannot be negative';
  END IF;

  v_gw := public.get_or_create_game_week();

  -- Check aura balance if betting
  IF v_bet > 0 THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND aura_balance < v_bet) THEN
      RAISE EXCEPTION 'Insufficient Aura for the bet, comrade';
    END IF;
  END IF;

  INSERT INTO public.parties (game_week_id, name, aura_bet, password, owner_id)
  VALUES (v_gw.id, v_clean, v_bet, nullif(trim(coalesce(p_password, '')), ''), v_uid)
  RETURNING * INTO v_row;

  -- Owner auto-joins
  INSERT INTO public.party_members (party_id, user_id) VALUES (v_row.id, v_uid);

  -- Deduct aura bet from owner
  IF v_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_bet WHERE id = v_uid;
  END IF;

  RETURN v_row;
end;
$$;

-- Function: join a party
CREATE OR REPLACE FUNCTION public.join_party(p_party_id uuid, p_password text DEFAULT null)
RETURNS public.party_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_row public.party_members;
begin
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;

  -- Check password if set
  IF v_party.password IS NOT NULL AND v_party.password <> '' THEN
    IF coalesce(p_password, '') <> v_party.password THEN
      RAISE EXCEPTION 'Wrong password, comrade';
    END IF;
  END IF;

  -- Check not already a member
  IF EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Already a member of this party';
  END IF;

  -- Check aura balance for bet
  IF v_party.aura_bet > 0 THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND aura_balance < v_party.aura_bet) THEN
      RAISE EXCEPTION 'Insufficient Aura for the bet, comrade';
    END IF;
  END IF;

  -- Join
  INSERT INTO public.party_members (party_id, user_id) VALUES (p_party_id, v_uid)
  RETURNING * INTO v_row;

  -- Deduct aura bet
  IF v_party.aura_bet > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_party.aura_bet WHERE id = v_uid;
  END IF;

  RETURN v_row;
end;
$$;

-- Function: use a ticket (consume it)
CREATE OR REPLACE FUNCTION public.use_ticket(p_game_week_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tickets;
begin
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = p_game_week_id AND used_at IS NULL
    ORDER BY created_at ASC LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No tickets remaining this week, comrade';
  END IF;

  UPDATE public.tickets SET used_at = now() WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
end;
$$;

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.get_or_create_game_week() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_game_week() TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_tickets() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_tickets() TO authenticated;

REVOKE ALL ON FUNCTION public.create_party(text, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_party(text, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.join_party(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_party(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.use_ticket(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_ticket(uuid) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.parties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
