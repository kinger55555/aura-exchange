/*
  # Change tickets from weekly to daily (3 per day)

  1. Changes
    - Replace `ensure_tickets()` function: now creates 3 tickets per calendar day
    - Tickets are still tied to game_week_id for context, but the daily count
      is based on `created_at::date = current_date`
    - Any tickets created on a previous day are considered "expired" for today's count

  2. Notes
    - No schema changes needed; `created_at` is used to determine the ticket's day
    - The function still calls `get_or_create_game_week()` so tickets reference the active week
*/

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

  -- Count only today's tickets
  SELECT count(*) INTO v_count FROM public.tickets
    WHERE user_id = v_uid
      AND game_week_id = v_gw.id
      AND created_at::date = current_date;

  -- Create missing tickets up to 3 for today
  WHILE v_count < 3 LOOP
    INSERT INTO public.tickets (user_id, game_week_id) VALUES (v_uid, v_gw.id);
    v_count := v_count + 1;
  END LOOP;
end;
$$;
