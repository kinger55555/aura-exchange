/*
  # Add game_sessions table, game_type column, and resolve_game function

  1. New Tables
    - `game_sessions`
      - `id` (uuid, primary key)
      - `party_id` (uuid, FK to parties)
      - `game_week_id` (uuid, FK to game_weeks)
      - `game_type` (text, which minigame: assembly_line, reactor_core, synchronized_march, resource_allocation)
      - `status` (text: pending, playing, completed, failed)
      - `aura_quota` (numeric, total aura bet by the party)
      - `result_data` (jsonb, stores game outcome details)
      - `started_at` (timestamptz)
      - `ended_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `game_weeks` - add `game_type` column (text) to store which minigame is active

  3. Functions
    - `resolve_game()`: calculates payout, distributes aura, records result
    - `start_game_session()`: creates a session, consumes a ticket, sets status to playing

  4. Security
    - RLS on game_sessions: authenticated can read, owner-party members can insert
    - resolve_game is SECURITY DEFINER to handle aura distribution
*/

-- Add game_type to game_weeks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_weeks' AND column_name = 'game_type'
  ) THEN
    ALTER TABLE public.game_weeks ADD COLUMN game_type text NOT NULL DEFAULT 'assembly_line';
  END IF;
END $$;

-- Game sessions
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  game_week_id uuid NOT NULL REFERENCES public.game_weeks(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  aura_quota numeric(14,2) NOT NULL DEFAULT 0,
  result_data jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_sessions_party_idx ON public.game_sessions (party_id);
CREATE INDEX IF NOT EXISTS game_sessions_week_idx ON public.game_sessions (game_week_id);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game sessions viewable by authenticated users"
  ON public.game_sessions FOR SELECT
  TO authenticated USING (true);

-- Update get_or_create_game_week to include game_type rotation
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
  v_game_names text[] := ARRAY['The Assembly Line', 'The Reactor Core', 'Synchronized March', 'Resource Allocation'];
  v_game_types text[] := ARRAY['assembly_line', 'reactor_core', 'synchronized_march', 'resource_allocation'];
  v_idx int;
begin
  v_label := to_char(now(), 'IYYY"-W"IW');
  SELECT * INTO v_row FROM public.game_weeks WHERE week_label = v_label;
  IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;

  v_week_start := date_trunc('week', now());
  v_week_end := v_week_start + interval '7 days' - interval '1 second';
  v_idx := (extract(week from now())::int % array_length(v_game_names, 1)) + 1;

  INSERT INTO public.game_weeks (week_label, game_name, game_type, starts_at, ends_at)
  VALUES (v_label, v_game_names[v_idx], v_game_types[v_idx], v_week_start, v_week_end)
  RETURNING * INTO v_row;

  RETURN v_row;
end;
$$;

-- Start a game session (consumes a ticket, sets party to playing)
CREATE OR REPLACE FUNCTION public.start_game_session(p_party_id uuid)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_party public.parties;
  v_gw public.game_weeks;
  v_session public.game_sessions;
  v_member_count int;
  v_total_bet numeric;
  v_ticket public.tickets;
begin
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify party membership
  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'You are not a member of this party';
  END IF;

  -- Count members (minimum 3)
  SELECT count(*) INTO v_member_count FROM public.party_members WHERE party_id = p_party_id;
  IF v_member_count < 3 THEN
    RAISE EXCEPTION 'The State requires at least 3 comrades for a shift';
  END IF;

  -- Check not already in an active session
  IF EXISTS (SELECT 1 FROM public.game_sessions WHERE party_id = p_party_id AND status IN ('pending', 'playing')) THEN
    RAISE EXCEPTION 'This party already has an active shift';
  END IF;

  -- Consume a ticket
  v_gw := public.get_or_create_game_week();
  SELECT * INTO v_ticket FROM public.tickets
    WHERE user_id = v_uid AND game_week_id = v_gw.id AND used_at IS NULL
    ORDER BY created_at ASC LIMIT 1;
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'No tickets remaining today, comrade';
  END IF;
  UPDATE public.tickets SET used_at = now() WHERE id = v_ticket.id;

  -- Calculate total quota
  v_total_bet := v_party.aura_bet * v_member_count;

  -- Create session
  INSERT INTO public.game_sessions (party_id, game_week_id, game_type, status, aura_quota, started_at)
  VALUES (p_party_id, v_gw.id, v_gw.game_type, 'playing', v_total_bet, now())
  RETURNING * INTO v_session;

  RETURN v_session;
end;
$$;

-- Resolve a game: calculate payout and distribute aura
CREATE OR REPLACE FUNCTION public.resolve_game(
  p_session_id uuid,
  p_status text,
  p_result_data jsonb DEFAULT null
)
RETURNS public.game_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.game_sessions;
  v_multiplier numeric := 0;
  v_payout_per_player numeric;
  v_member record;
begin
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status != 'playing' THEN RAISE EXCEPTION 'Session is not active'; END IF;

  -- Determine multiplier from result_data
  IF p_result_data ? 'multiplier' THEN
    v_multiplier := (p_result_data->>'multiplier')::numeric;
  END IF;

  -- Update session
  UPDATE public.game_sessions
  SET status = p_status, result_data = p_result_data, ended_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Distribute aura based on outcome
  IF v_multiplier > 0 AND v_session.aura_quota > 0 THEN
    -- Total payout = quota * multiplier, split equally
    v_payout_per_player := round((v_session.aura_quota * v_multiplier) /
      (SELECT count(*) FROM public.party_members WHERE party_id = v_session.party_id), 2);

    FOR v_member IN SELECT user_id FROM public.party_members WHERE party_id = v_session.party_id LOOP
      UPDATE public.profiles SET aura_balance = aura_balance + v_payout_per_player
        WHERE id = v_member.user_id;
    END LOOP;
  ELSIF v_multiplier = 0 AND v_session.aura_quota > 0 AND p_status = 'completed' THEN
    -- Refund: comrades get their individual bet back
    FOR v_member IN
      SELECT user_id FROM public.party_members WHERE party_id = v_session.party_id
    LOOP
      -- We need the per-player bet; it's quota / member count
      UPDATE public.profiles SET aura_balance = aura_balance + (v_session.aura_quota / (SELECT count(*) FROM public.party_members WHERE party_id = v_session.party_id))
        WHERE id = v_member.user_id;
    END LOOP;
  END IF;

  -- If a dissident (AFK) caused failure, the dissident already lost their bet
  -- result_data should contain 'dissident_id' — we do NOT refund them
  IF p_status = 'failed' AND p_result_data ? 'dissident_id' THEN
    -- Refund everyone except the dissident
    FOR v_member IN
      SELECT user_id FROM public.party_members WHERE party_id = v_session.party_id
        AND user_id != (p_result_data->>'dissident_id')::uuid
    LOOP
      UPDATE public.profiles SET aura_balance = aura_balance + (v_session.aura_quota / (SELECT count(*) FROM public.party_members WHERE party_id = v_session.party_id))
        WHERE id = v_member.user_id;
    END LOOP;
  END IF;

  RETURN v_session;
end;
$$;

-- Grant execute
REVOKE ALL ON FUNCTION public.start_game_session(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_session(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_game(uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_game(uuid, text, jsonb) TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
