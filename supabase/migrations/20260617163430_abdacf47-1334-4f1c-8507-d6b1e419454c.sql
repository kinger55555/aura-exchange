
-- ============ TRADES & MARKETPLACE ============

CREATE TYPE public.trade_status AS ENUM ('pending','accepted','rejected','cancelled','expired');
CREATE TYPE public.listing_status AS ENUM ('active','sold','cancelled');

-- ---- Trade offers (escrow-based) ----
CREATE TABLE public.trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_aura numeric(14,2) NOT NULL DEFAULT 0,
  requested_aura numeric(14,2) NOT NULL DEFAULT 0,
  message text,
  status public.trade_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT trade_offers_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT trade_offers_aura_nonneg CHECK (offered_aura >= 0 AND requested_aura >= 0)
);
CREATE INDEX trade_offers_to_idx ON public.trade_offers(to_user_id, status);
CREATE INDEX trade_offers_from_idx ON public.trade_offers(from_user_id, status);

GRANT SELECT ON public.trade_offers TO authenticated;
GRANT ALL ON public.trade_offers TO service_role;
ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_offers visible to participants"
  ON public.trade_offers FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Side of trade ("offer" = sender's escrow, "request" = recipient must hand over)
CREATE TABLE public.trade_offer_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trade_offers(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('offer','request'))
);
CREATE INDEX trade_offer_titles_trade_idx ON public.trade_offer_titles(trade_id);

GRANT SELECT ON public.trade_offer_titles TO authenticated;
GRANT ALL ON public.trade_offer_titles TO service_role;
ALTER TABLE public.trade_offer_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade titles visible to trade participants"
  ON public.trade_offer_titles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trade_offers t
     WHERE t.id = trade_id AND (t.from_user_id = auth.uid() OR t.to_user_id = auth.uid())
  ));

-- ---- Marketplace listings ----
CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  price numeric(14,2) NOT NULL CHECK (price > 0 AND price <= 100000),
  status public.listing_status NOT NULL DEFAULT 'active',
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz
);
CREATE INDEX marketplace_active_idx ON public.marketplace_listings(status, created_at DESC);
CREATE INDEX marketplace_seller_idx ON public.marketplace_listings(seller_id);

GRANT SELECT ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketplace listings public read"
  ON public.marketplace_listings FOR SELECT TO authenticated USING (true);

-- ============ RPCs ============

-- Helper: 10% trade tax → state bank
CREATE OR REPLACE FUNCTION public._trade_tax(p_amount numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round(p_amount * 0.10, 2)
$$;

-- Create trade offer: escrows offered aura + offered titles
CREATE OR REPLACE FUNCTION public.create_trade_offer(
  p_to_nickname text,
  p_offered_aura numeric,
  p_requested_aura numeric,
  p_offered_title_ids uuid[],
  p_requested_title_ids uuid[],
  p_message text DEFAULT NULL
) RETURNS trade_offers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_me public.profiles;
  v_offer numeric := round(coalesce(p_offered_aura,0)::numeric, 2);
  v_request numeric := round(coalesce(p_requested_aura,0)::numeric, 2);
  v_row public.trade_offers;
  v_tid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  IF v_offer < 0 OR v_request < 0 THEN RAISE EXCEPTION 'Aura cannot be negative'; END IF;
  IF v_offer = 0 AND v_request = 0
     AND coalesce(array_length(p_offered_title_ids,1),0) = 0
     AND coalesce(array_length(p_requested_title_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'Trade must include something';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE lower(nickname) = lower(trim(p_to_nickname));
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Comrade not found'; END IF;
  IF v_target.id = v_uid THEN RAISE EXCEPTION 'Cannot trade with yourself'; END IF;

  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_me.aura_balance < v_offer THEN RAISE EXCEPTION 'Insufficient Aura'; END IF;

  -- Verify ownership of offered titles
  IF p_offered_title_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_offered_title_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_uid AND title_id = v_tid) THEN
        RAISE EXCEPTION 'You do not own one of the offered titles';
      END IF;
    END LOOP;
  END IF;

  -- Verify recipient has requested titles
  IF p_requested_title_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_requested_title_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_target.id AND title_id = v_tid) THEN
        RAISE EXCEPTION 'Recipient does not own one of the requested titles';
      END IF;
    END LOOP;
  END IF;

  -- Escrow: deduct aura, remove offered titles from owner
  IF v_offer > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_offer WHERE id = v_uid;
  END IF;

  INSERT INTO public.trade_offers (from_user_id, to_user_id, offered_aura, requested_aura, message)
  VALUES (v_uid, v_target.id, v_offer, v_request, nullif(trim(coalesce(p_message,'')),''))
  RETURNING * INTO v_row;

  IF p_offered_title_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_offered_title_ids LOOP
      UPDATE public.profiles SET equipped_title_id = NULL
        WHERE id = v_uid AND equipped_title_id = v_tid;
      DELETE FROM public.user_titles WHERE user_id = v_uid AND title_id = v_tid;
      INSERT INTO public.trade_offer_titles (trade_id, title_id, side) VALUES (v_row.id, v_tid, 'offer');
    END LOOP;
  END IF;

  IF p_requested_title_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_requested_title_ids LOOP
      INSERT INTO public.trade_offer_titles (trade_id, title_id, side) VALUES (v_row.id, v_tid, 'request');
    END LOOP;
  END IF;

  PERFORM public.notify_push(v_target.id, 'New trade offer',
    'A comrade has proposed a trade.', '/trades');

  RETURN v_row;
END; $$;

-- Cancel: return escrow to sender
CREATE OR REPLACE FUNCTION public.cancel_trade_offer(p_trade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.trade_offers;
  v_t record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.trade_offers WHERE id = p_trade_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_row.from_user_id <> v_uid THEN RAISE EXCEPTION 'Only the sender can cancel'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Trade already closed'; END IF;

  IF v_row.offered_aura > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_row.offered_aura WHERE id = v_uid;
  END IF;
  FOR v_t IN SELECT title_id FROM public.trade_offer_titles WHERE trade_id = p_trade_id AND side = 'offer' LOOP
    INSERT INTO public.user_titles (user_id, title_id) VALUES (v_uid, v_t.title_id)
      ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.trade_offers SET status = 'cancelled', resolved_at = now() WHERE id = p_trade_id;
END; $$;

-- Reject: return escrow to sender
CREATE OR REPLACE FUNCTION public.reject_trade_offer(p_trade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.trade_offers;
  v_t record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.trade_offers WHERE id = p_trade_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_row.to_user_id <> v_uid THEN RAISE EXCEPTION 'Only the recipient can reject'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Trade already closed'; END IF;

  IF v_row.offered_aura > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + v_row.offered_aura WHERE id = v_row.from_user_id;
  END IF;
  FOR v_t IN SELECT title_id FROM public.trade_offer_titles WHERE trade_id = p_trade_id AND side = 'offer' LOOP
    INSERT INTO public.user_titles (user_id, title_id) VALUES (v_row.from_user_id, v_t.title_id)
      ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.trade_offers SET status = 'rejected', resolved_at = now() WHERE id = p_trade_id;
  PERFORM public.notify_push(v_row.from_user_id, 'Trade rejected', 'Your trade was rejected.', '/trades');
END; $$;

-- Accept: recipient pays requested aura + hands over requested titles; receives offered side; 10% tax on aura
CREATE OR REPLACE FUNCTION public.accept_trade_offer(p_trade_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.trade_offers;
  v_recipient public.profiles;
  v_tax_offer numeric;
  v_tax_request numeric;
  v_total_tax numeric;
  v_t record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  SELECT * INTO v_row FROM public.trade_offers WHERE id = p_trade_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_row.to_user_id <> v_uid THEN RAISE EXCEPTION 'Only the recipient can accept'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'Trade already closed'; END IF;

  SELECT * INTO v_recipient FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_recipient.aura_balance < v_row.requested_aura THEN RAISE EXCEPTION 'Insufficient Aura to accept'; END IF;

  -- Verify recipient still owns all requested titles
  FOR v_t IN SELECT title_id FROM public.trade_offer_titles WHERE trade_id = p_trade_id AND side = 'request' LOOP
    IF NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_uid AND title_id = v_t.title_id) THEN
      RAISE EXCEPTION 'You no longer own one of the requested titles';
    END IF;
  END LOOP;

  v_tax_offer := public._trade_tax(v_row.offered_aura);
  v_tax_request := public._trade_tax(v_row.requested_aura);
  v_total_tax := v_tax_offer + v_tax_request;

  -- Pay recipient (escrowed offered_aura minus tax)
  IF v_row.offered_aura > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance + (v_row.offered_aura - v_tax_offer)
      WHERE id = v_uid;
  END IF;
  -- Pay sender (requested aura from recipient, minus tax)
  IF v_row.requested_aura > 0 THEN
    UPDATE public.profiles SET aura_balance = aura_balance - v_row.requested_aura WHERE id = v_uid;
    UPDATE public.profiles SET aura_balance = aura_balance + (v_row.requested_aura - v_tax_request)
      WHERE id = v_row.from_user_id;
  END IF;
  -- Bank the tax
  IF v_total_tax > 0 THEN
    UPDATE public.aura_bank SET balance = balance + v_total_tax, updated_at = now() WHERE id = 1;
  END IF;

  -- Transfer offered titles → recipient
  FOR v_t IN SELECT title_id FROM public.trade_offer_titles WHERE trade_id = p_trade_id AND side = 'offer' LOOP
    INSERT INTO public.user_titles (user_id, title_id) VALUES (v_uid, v_t.title_id)
      ON CONFLICT DO NOTHING;
  END LOOP;

  -- Transfer requested titles → sender (remove from recipient first)
  FOR v_t IN SELECT title_id FROM public.trade_offer_titles WHERE trade_id = p_trade_id AND side = 'request' LOOP
    UPDATE public.profiles SET equipped_title_id = NULL
      WHERE id = v_uid AND equipped_title_id = v_t.title_id;
    DELETE FROM public.user_titles WHERE user_id = v_uid AND title_id = v_t.title_id;
    INSERT INTO public.user_titles (user_id, title_id) VALUES (v_row.from_user_id, v_t.title_id)
      ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.trade_offers SET status = 'accepted', resolved_at = now() WHERE id = p_trade_id;
  PERFORM public.notify_push(v_row.from_user_id, 'Trade accepted', 'Your trade went through.', '/trades');
END; $$;

-- ============ Marketplace RPCs ============

CREATE OR REPLACE FUNCTION public.list_title_for_sale(p_title_id uuid, p_price numeric)
RETURNS marketplace_listings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_price numeric := round(p_price::numeric, 2);
  v_row public.marketplace_listings;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  IF v_price <= 0 OR v_price > 100000 THEN RAISE EXCEPTION 'Price must be 1-100000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_uid AND title_id = p_title_id) THEN
    RAISE EXCEPTION 'You do not own this title';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_listings WHERE seller_id = v_uid AND title_id = p_title_id AND status = 'active') THEN
    RAISE EXCEPTION 'Already listed';
  END IF;

  -- Escrow: remove title from seller
  UPDATE public.profiles SET equipped_title_id = NULL
    WHERE id = v_uid AND equipped_title_id = p_title_id;
  DELETE FROM public.user_titles WHERE user_id = v_uid AND title_id = p_title_id;

  INSERT INTO public.marketplace_listings (seller_id, title_id, price)
  VALUES (v_uid, p_title_id, v_price) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.marketplace_listings;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.marketplace_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_row.seller_id <> v_uid THEN RAISE EXCEPTION 'Not your listing'; END IF;
  IF v_row.status <> 'active' THEN RAISE EXCEPTION 'Listing already closed'; END IF;

  -- Return title to seller
  INSERT INTO public.user_titles (user_id, title_id) VALUES (v_uid, v_row.title_id)
    ON CONFLICT DO NOTHING;
  UPDATE public.marketplace_listings SET status = 'cancelled' WHERE id = p_listing_id;
END; $$;

CREATE OR REPLACE FUNCTION public.buy_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.marketplace_listings;
  v_buyer public.profiles;
  v_tax numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.is_banned(v_uid) THEN RAISE EXCEPTION 'You are banned'; END IF;
  SELECT * INTO v_row FROM public.marketplace_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_row.status <> 'active' THEN RAISE EXCEPTION 'Listing no longer available'; END IF;
  IF v_row.seller_id = v_uid THEN RAISE EXCEPTION 'Cannot buy your own listing'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_uid AND title_id = v_row.title_id) THEN
    RAISE EXCEPTION 'You already own this title';
  END IF;

  SELECT * INTO v_buyer FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_buyer.aura_balance < v_row.price THEN RAISE EXCEPTION 'Insufficient Aura'; END IF;

  v_tax := public._trade_tax(v_row.price);

  UPDATE public.profiles SET aura_balance = aura_balance - v_row.price WHERE id = v_uid;
  UPDATE public.profiles SET aura_balance = aura_balance + (v_row.price - v_tax) WHERE id = v_row.seller_id;
  IF v_tax > 0 THEN
    UPDATE public.aura_bank SET balance = balance + v_tax, updated_at = now() WHERE id = 1;
  END IF;

  INSERT INTO public.user_titles (user_id, title_id) VALUES (v_uid, v_row.title_id)
    ON CONFLICT DO NOTHING;

  UPDATE public.marketplace_listings
    SET status = 'sold', buyer_id = v_uid, sold_at = now()
    WHERE id = p_listing_id;

  PERFORM public.notify_push(v_row.seller_id, 'Title sold',
    'Your listing sold for ' || v_row.price::text || ' Aura.', '/trades');
END; $$;
