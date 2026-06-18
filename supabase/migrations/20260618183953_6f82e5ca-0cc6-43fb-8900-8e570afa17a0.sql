
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_listing_views(p_listing_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.marketplace_listings
     SET views = views + 1
   WHERE id = ANY(p_listing_ids)
     AND status = 'active'
     AND seller_id <> auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_listing_views(uuid[]) TO authenticated;
