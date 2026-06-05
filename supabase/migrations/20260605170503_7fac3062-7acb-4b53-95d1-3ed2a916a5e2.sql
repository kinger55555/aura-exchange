
-- Catalog
CREATE TABLE public.titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL UNIQUE,
  tier text NOT NULL,
  buyable boolean NOT NULL DEFAULT false,
  cost integer,
  unlock_condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.titles TO anon, authenticated;
GRANT ALL ON public.titles TO service_role;
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titles readable by all" ON public.titles FOR SELECT USING (true);

-- Ownership
CREATE TABLE public.user_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, title_id)
);
GRANT SELECT ON public.user_titles TO authenticated;
GRANT ALL ON public.user_titles TO service_role;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own titles" ON public.user_titles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "anyone read titles for display" ON public.user_titles FOR SELECT TO anon, authenticated USING (true);

-- Profile equipped title
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped_title_id uuid REFERENCES public.titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title_position text NOT NULL DEFAULT 'prefix' CHECK (title_position IN ('prefix','suffix'));

-- Seed catalog
INSERT INTO public.titles (text, tier, buyable, cost, unlock_condition) VALUES
('Comrade ','Common',true,25,NULL),
('Worker ','Common',true,25,NULL),
('Peasant ','Common',true,25,NULL),
('Drafted ','Common',true,25,NULL),
('Citizen ','Common',true,25,NULL),
('Proletariat ','Common',true,25,NULL),
('Under-Quota ','Common',true,25,NULL),
('Over-Worked ','Common',true,25,NULL),
('Censored ','Common',true,25,NULL),
('Breadline ','Common',true,25,NULL),
('State-Funded ','Common',true,25,NULL),
('The Taxed ','Common',true,25,NULL),
('The Audited ','Common',true,25,NULL),
('The Rationed ','Common',true,25,NULL),
('The Registered ','Common',true,25,NULL),
('The Compliant ','Common',true,25,NULL),
('Factory-Hand ','Common',true,25,NULL),
('Tractor-Driver ','Common',true,25,NULL),
('Coal-Miner ','Common',true,25,NULL),
('The Commute ','Common',true,25,NULL),
('Standard-Issue ','Common',true,25,NULL),
('The Subordinate ','Common',true,25,NULL),
('Minimum-Wage ','Common',true,25,NULL),
('The Monitored ','Common',true,25,NULL),
('The Inspected ','Common',true,25,NULL),
('Card-Puncher ','Common',true,25,NULL),
('The Unskilled ','Common',true,25,NULL),
('The Expendable ','Common',true,25,NULL),
('The Assembly-Line ','Common',true,25,NULL),
('The Anonymous ','Common',true,25,NULL),
('The Unranked ','Common',true,25,NULL),
('The Scheduled ','Common',true,25,NULL),
('Brick-Layer ','Common',true,25,NULL),
('The Replaceable ','Common',true,25,NULL),
('Aura-Broke ','Common',false,NULL,'Drop your Aura balance to exactly 0.'),
('Awaiting-Trial ','Common',false,NULL,'Receive 3 different player reports within 24 hours.'),
('The Banned ','Common',false,NULL,'Serve a temporary ban and successfully log back in.'),
('The Un-Purged ','Common',false,NULL,'Get flagged by AuraGuard, but have a Moderator dismiss the case.'),
('The Denied ','Common',false,NULL,'Have an Aura transfer blocked by your daily limit.'),
('The Dust ','Common',false,NULL,'Generate exactly 1 full Aura in decimals dropped to the State Bank.'),
('The Sender ','Common',false,NULL,'Max out your 10% daily transfer cap.'),
('The Receiver ','Common',false,NULL,'Receive 5 separate Aura transfers in one day.'),
('The Overdraft ','Common',false,NULL,'Attempt to send more Aura than you currently hold.'),
('The Snitched ','Common',false,NULL,'Be the subject of a player report.'),
('The Questioned ','Common',false,NULL,'Receive an official warning or minor Aura deduction from a Mod.'),
('The Penalized ','Common',false,NULL,'Lose 10+ Aura from a single Staff justice action.'),
('The Flagged ','Common',false,NULL,'Trigger the AuraGuard automated warning system 3 times.'),
('The Restricted ','Common',false,NULL,'Have your transfer privileges temporarily locked.'),
('The Appealer ','Common',false,NULL,'Submit a formal ban appeal to the State.'),
('The Spectator ','Common',false,NULL,'Log in for 7 days straight without sending a single Aura.'),
('Iron ','Rare',true,250,NULL),
('Red ','Rare',true,250,NULL),
('Inspector ','Rare',true,250,NULL),
('Sanctioned ','Rare',true,250,NULL),
('Redacted ','Rare',true,250,NULL),
('Exiled ','Rare',true,250,NULL),
('Sub-Committee ','Rare',true,250,NULL),
('Bureaucrat ','Rare',true,250,NULL),
('The Redistributed ','Rare',true,250,NULL),
('The Enforcer ','Rare',true,250,NULL),
('Propaganda-Master ','Rare',true,250,NULL),
('The Loyal ','Rare',true,250,NULL),
('The Union ','Rare',true,250,NULL),
('Steel ','Rare',true,250,NULL),
('State-Approved ','Rare',true,250,NULL),
('The Quartermaster ','Rare',true,250,NULL),
('The Clerk ','Rare',true,250,NULL),
('The Informant ','Rare',false,NULL,'Successfully report 20 dissidents who receive penalties.'),
('The Hoarder ','Rare',false,NULL,'Maintain a balance of over 100 Aura for 3 consecutive days.'),
('The Contributor ','Rare',false,NULL,'Send a lifetime total of 50 Aura to other comrades.'),
('The Benefactor ','Rare',false,NULL,'Send a single transfer large enough to generate a 5+ Aura bonus for the receiver.'),
('The Pardoned ','Rare',false,NULL,'Have an Aura penalty successfully overturned on appeal.'),
('The Escalator ','Rare',false,NULL,'Submit a report that gets escalated from Mod to Admin.'),
('The Auditor ','Rare',false,NULL,'Use the report button on a Staff member (Mod/Admin).'),
('The Suspect ','Rare',false,NULL,'Survive a direct Admin review without receiving a ban.'),
('The Secret-Police ','Epic',true,1500,NULL),
('Liquidator ','Epic',true,1500,NULL),
('The Vanguard ','Epic',true,1500,NULL),
('The Central-Bank ','Epic',true,1500,NULL),
('The Un-Bribable ','Epic',true,1500,NULL),
('Minister ','Epic',true,1500,NULL),
('The Oligarch ','Epic',true,1500,NULL),
('The Politburo ','Epic',true,1500,NULL),
('The Gulag-Survivor ','Epic',false,NULL,'Successfully return to the game after serving a full 7-day Admin ban.'),
('The Influencer ','Epic',false,NULL,'Accumulate 500+ total Aura over the lifetime of your account.'),
('The Revolutionary ','Epic',false,NULL,'Purchase enough ranks to unlock your first Salary.'),
('The Purger ','Epic',false,NULL,'[Staff Only] Dismiss 10 false reports from the justice queue.'),
('The Totalitarian ','Legendary',true,10000,NULL),
('The Supreme ','Legendary',true,10000,NULL),
('The Iron-Curtain ','Legendary',true,10000,NULL),
('The Dictator ','Legendary',true,10000,NULL),
('Gulag-Warden ','Legendary',false,NULL,'[Staff Only] Issue a combined total of 100 days worth of bans.'),
('true dictator ','Legendary',false,NULL,'Reach Rank 9 first.'),
('The Absolute ','Godlike',true,100000,NULL),
('The Immortal ','Godlike',true,100000,NULL),
('The State Itself ','Godlike',false,NULL,'Hold the #1 spot on the ''Ranks'' Leaderboard for 7 consecutive days.');

-- RPCs
CREATE OR REPLACE FUNCTION public.purchase_title(p_title_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cost integer;
  v_buyable boolean;
  v_bal numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT buyable, cost INTO v_buyable, v_cost FROM public.titles WHERE id = p_title_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Title not found'; END IF;
  IF NOT v_buyable THEN RAISE EXCEPTION 'This title is not for sale'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_user AND title_id = p_title_id) THEN
    RAISE EXCEPTION 'You already own this title';
  END IF;
  SELECT aura_balance INTO v_bal FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_bal < v_cost THEN RAISE EXCEPTION 'Not enough Aura'; END IF;
  UPDATE public.profiles SET aura_balance = aura_balance - v_cost WHERE id = v_user;
  INSERT INTO public.user_titles (user_id, title_id) VALUES (v_user, p_title_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_title(p_title_id uuid, p_position text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_position NOT IN ('prefix','suffix') THEN RAISE EXCEPTION 'Bad position'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_titles WHERE user_id = v_user AND title_id = p_title_id) THEN
    RAISE EXCEPTION 'You do not own this title';
  END IF;
  UPDATE public.profiles SET equipped_title_id = p_title_id, title_position = p_position WHERE id = v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.unequip_title()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  UPDATE public.profiles SET equipped_title_id = NULL WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_title(p_nickname text, p_title_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = v_user AND role = 'owner') THEN
    RAISE EXCEPTION 'Owner only';
  END IF;
  SELECT id INTO v_target FROM public.profiles WHERE nickname = p_nickname;
  IF v_target IS NULL THEN RAISE EXCEPTION 'No such comrade'; END IF;
  INSERT INTO public.user_titles (user_id, title_id) VALUES (v_target, p_title_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_title(p_nickname text, p_title_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = v_user AND role = 'owner') THEN
    RAISE EXCEPTION 'Owner only';
  END IF;
  SELECT id INTO v_target FROM public.profiles WHERE nickname = p_nickname;
  IF v_target IS NULL THEN RAISE EXCEPTION 'No such comrade'; END IF;
  UPDATE public.profiles SET equipped_title_id = NULL WHERE id = v_target AND equipped_title_id = p_title_id;
  DELETE FROM public.user_titles WHERE user_id = v_target AND title_id = p_title_id;
END;
$$;
