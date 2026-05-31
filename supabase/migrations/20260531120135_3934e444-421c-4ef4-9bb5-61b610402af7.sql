UPDATE public.ranks SET upgrade_cost = upgrade_cost / 100;

CREATE OR REPLACE FUNCTION public.get_rank_info(p_rank integer)
 RETURNS ranks
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.ranks;
BEGIN
  IF p_rank < 1 THEN p_rank := 1; END IF;
  SELECT * INTO v_row FROM public.ranks WHERE rank = p_rank;
  IF v_row.rank IS NOT NULL THEN RETURN v_row; END IF;
  v_row.rank := p_rank;
  v_row.name := 'Stalin' || repeat('+', p_rank - 9);
  v_row.upgrade_cost := 10 * power(2, p_rank - 2)::numeric;
  v_row.max_aura := 100 * power(2, p_rank - 1)::numeric;
  v_row.max_send := 100 * p_rank;
  v_row.tickets := p_rank - 1;
  v_row.multiplier := CASE WHEN p_rank < 4 THEN 1.0 ELSE 1.0 + 0.1 * (p_rank - 3) END;
  v_row.salary := CASE WHEN p_rank < 5 THEN 0 ELSE 25 * power(2, p_rank - 5)::numeric END;
  v_row.super_tickets := CASE WHEN p_rank < 9 THEN 0 ELSE power(2, p_rank - 9)::int END;
  RETURN v_row;
END;
$function$;