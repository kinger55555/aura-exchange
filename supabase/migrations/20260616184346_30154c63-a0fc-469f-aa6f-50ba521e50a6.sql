
-- 1. push_subscriptions table
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);

-- 2. RPCs for client subscribe / unsubscribe
CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.push_subscriptions
   WHERE endpoint = p_endpoint AND user_id = auth.uid();
END; $$;

REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text,text,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;

-- 3. Helper that fans out via pg_net to the public push endpoint
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_push(p_user_id uuid, p_title text, p_body text, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://aura-of-accord.lovable.app/api/public/hooks/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'url', p_url
    )
  );
END; $$;

-- 4. Triggers
CREATE OR REPLACE FUNCTION public.tg_notify_party_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_party_name text; v_from_name text;
BEGIN
  SELECT name INTO v_party_name FROM public.parties WHERE id = NEW.party_id;
  SELECT nickname INTO v_from_name FROM public.profiles WHERE id = NEW.from_user_id;
  PERFORM public.notify_push(
    NEW.to_user_id,
    'New party invite',
    COALESCE(v_from_name,'A comrade') || ' invited you to "' || COALESCE(v_party_name,'a party') || '"',
    '/games'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_party_invite ON public.party_invites;
CREATE TRIGGER trg_notify_party_invite AFTER INSERT ON public.party_invites
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_party_invite();

CREATE OR REPLACE FUNCTION public.tg_notify_shift_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member RECORD;
BEGIN
  FOR v_member IN SELECT user_id FROM public.party_members WHERE party_id = NEW.party_id LOOP
    PERFORM public.notify_push(
      v_member.user_id,
      'Shift has begun',
      'Your party''s shift just started. Get to work, comrade!',
      '/games'
    );
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_shift_start ON public.game_sessions;
CREATE TRIGGER trg_notify_shift_start AFTER INSERT ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_shift_start();

CREATE OR REPLACE FUNCTION public.tg_notify_warning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_push(
    NEW.user_id,
    'Staff warning issued',
    'Reason: ' || COALESCE(NEW.reason,'(no reason given)'),
    '/justice'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_warning ON public.staff_warnings;
CREATE TRIGGER trg_notify_warning AFTER INSERT ON public.staff_warnings
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_warning();

CREATE OR REPLACE FUNCTION public.tg_notify_ban()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_push(
    NEW.user_id,
    'You have been banned',
    COALESCE(NEW.reason, 'See the justice page for details.'),
    '/banned'
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_ban ON public.bans;
CREATE TRIGGER trg_notify_ban AFTER INSERT ON public.bans
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_ban();
